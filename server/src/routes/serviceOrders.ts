import type { FastifyInstance } from "fastify";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import {
  accessories,
  devices,
  osNotifications,
  profiles,
  serviceOrders,
  stockMovements,
} from "../db/schema/index";
import { authenticate, requireRole, type JwtUser } from "../plugins/auth";
import { logAudit } from "../services/audit";
import { EVENT_BY_STATUS, notifyOs } from "../services/osNotifications";
import { COST_RESPONSIBILITIES, OS_EVENTS, isExemptResponsibility } from "../services/osMessages";

const FINALIZED = "Entregue / Finalizado";
const STORE_ORIGIN = "Estoque da loja";

const osStatus = z.enum([
  "Aguardando Diagnóstico",
  "Em Diagnóstico",
  "Aguardando Aprovação",
  "Aguardando Peça",
  "Em Reparo",
  "Pronto para Retirada",
  "Entregue / Finalizado",
]);

// Wire format = colunas planas (checklist separado), dinheiro como número
const osBase = z.object({
  origin: z.enum(["Cliente", STORE_ORIGIN]).default("Cliente"),
  deviceId: z.string().uuid().optional().nullable(),
  costResponsibility: z.enum(COST_RESPONSIBILITIES).default("Cliente"),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().max(200).optional().default(""),
  customerPhone: z.string().max(30).optional().default(""),
  customerCpf: z.string().max(20).optional().default(""),
  model: z.string().max(100).optional().default(""),
  color: z.string().max(60).optional().default(""),
  serialImei: z.string().max(60).optional().default(""), // IMEI 1
  imei2: z.string().max(60).optional().default(""), // IMEI 2
  serial: z.string().max(60).optional().default(""), // número de série
  batteryHealth: z.coerce.number().int().min(0).max(100).optional(),
  reportedIssue: z.string().min(1).max(2000),
  technicalNotes: z.string().max(4000).optional().default(""),
  checklistCapa: z.boolean().optional().default(false),
  checklistChip: z.boolean().optional().default(false),
  checklistCarregador: z.boolean().optional().default(false),
  status: osStatus.default("Aguardando Diagnóstico"),
  priority: z.enum(["Normal", "Urgente", "Crítico"]).default("Normal"),
  partCost: z.coerce.number().min(0).default(0),
  laborCost: z.coerce.number().min(0).default(0),
  partDescription: z.string().max(300).optional().default(""),
  partFromStock: z.boolean().optional().default(false),
  stockAccessoryId: z.string().uuid().optional().nullable(),
  chargedAmount: z.coerce.number().min(0).default(0),
  taxes: z.coerce.number().min(0).default(0),
});

const createSchema = osBase.superRefine((d, ctx) => {
  if (d.origin === STORE_ORIGIN) {
    if (!d.deviceId) ctx.addIssue({ code: "custom", path: ["deviceId"], message: "Escolha o aparelho do estoque." });
  } else {
    if (!d.customerName.trim()) ctx.addIssue({ code: "custom", path: ["customerName"], message: "Informe o cliente." });
    if (!d.model.trim()) ctx.addIssue({ code: "custom", path: ["model"], message: "Informe o modelo." });
  }
});

// Origem e aparelho não mudam depois de criada a OS
const patchSchema = osBase.omit({ origin: true, deviceId: true }).partial();

// Converte os campos de dinheiro (number) para string do numeric do Postgres
function toMoneyValues(d: Record<string, unknown>) {
  const v = { ...d };
  for (const k of ["partCost", "laborCost", "chargedAmount", "taxes"] as const) {
    if (v[k] !== undefined) v[k] = String(v[k]);
  }
  if (v.stockAccessoryId === "") v.stockAccessoryId = null;
  if (v.customerId === "") v.customerId = null;
  return v;
}

function osError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const shortId = (id: string) => id.slice(0, 8).toUpperCase();

function deviceLabel(d: { model: string; capacity: string }) {
  const cap = d.capacity ? (/^\d+$/.test(d.capacity) ? `${d.capacity}GB` : d.capacity) : "";
  return `${d.model}${cap ? ` ${cap}` : ""}`;
}

// Aparelho do estoque vai para a assistência: trava a linha, valida e marca
// "Em Manutenção" / local "Assistência", guardando a situação anterior.
async function takeDevice(tx: Tx, deviceId: string, osId: string, userId: string) {
  const [dev] = await tx.select().from(devices).where(eq(devices.id, deviceId)).for("update").limit(1);
  if (!dev) throw osError("Aparelho não encontrado no estoque.", 409);
  if (dev.status === "Vendido") throw osError("Este aparelho já foi vendido e não pode ir para a assistência.", 409);
  const [other] = await tx
    .select({ id: serviceOrders.id })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.deviceId, deviceId), ne(serviceOrders.status, FINALIZED), ne(serviceOrders.id, osId)))
    .limit(1);
  if (other) throw osError(`Este aparelho já está em outra OS aberta (OS ${shortId(other.id)}).`, 409);

  await tx
    .update(devices)
    .set({ status: "Em Manutenção", location: "Assistência" })
    .where(eq(devices.id, deviceId));
  await tx.insert(stockMovements).values({
    productType: "device",
    productId: deviceId,
    movementType: "saida",
    quantity: 1,
    reason: `Enviado para a assistência (OS ${shortId(osId)})`,
    userId,
  });
  return { dev, prevStatus: dev.status as string, prevLocation: dev.location };
}

// Devolve o aparelho ao estoque ao finalizar/excluir a OS — só se ele ainda estiver
// "Em Manutenção" (se foi vendido ou alterado nesse meio tempo, não sobrescreve).
async function releaseDevice(
  tx: Tx,
  os: { id: string; deviceId: string | null; prevDeviceStatus: string | null; prevDeviceLocation: string | null },
  userId: string
) {
  if (!os.deviceId) return;
  const [dev] = await tx.select().from(devices).where(eq(devices.id, os.deviceId)).for("update").limit(1);
  if (!dev || dev.status !== "Em Manutenção") return;
  const prev = os.prevDeviceStatus;
  const status = prev === "Disponível" || prev === "Reservado" ? prev : "Disponível";
  const prevLoc = os.prevDeviceLocation && os.prevDeviceLocation !== "Assistência" ? os.prevDeviceLocation : "Estoque";
  // Só volta o local se ninguém o mudou à mão enquanto o aparelho estava na assistência
  const location = dev.location === "Assistência" ? prevLoc : dev.location;
  await tx
    .update(devices)
    .set({ status: status as "Disponível" | "Reservado", location })
    .where(eq(devices.id, os.deviceId));
  await tx.insert(stockMovements).values({
    productType: "device",
    productId: os.deviceId,
    movementType: "entrada",
    quantity: 1,
    reason: `Voltou da assistência (OS ${shortId(os.id)})`,
    userId,
  });
}

// Eventos de WhatsApp já enviados com sucesso, por OS (base do filtro "Pendentes")
async function sentEventsByOs(): Promise<Map<string, string[]>> {
  const rows = await db
    .selectDistinct({ osId: osNotifications.osId, event: osNotifications.event })
    .from(osNotifications)
    .where(eq(osNotifications.status, "sent"));
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.osId, [...(map.get(r.osId) ?? []), r.event]);
  return map;
}

async function sentEventsFor(osId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ event: osNotifications.event })
    .from(osNotifications)
    .where(and(eq(osNotifications.osId, osId), eq(osNotifications.status, "sent")));
  return rows.map((r) => r.event);
}

export async function serviceOrderRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /service-orders
  app.get("/service-orders", async () => {
    const rows = await db.select().from(serviceOrders).orderBy(desc(serviceOrders.createdAt));
    const sent = await sentEventsByOs();
    return { serviceOrders: rows.map((r) => ({ ...r, sentEvents: sent.get(r.id) ?? [] })) };
  });

  // POST /service-orders
  app.post("/service-orders", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const input = parsed.data;
    const userId = (req.user as JwtUser).sub;
    const fromStock = input.origin === STORE_ORIGIN;
    const data = toMoneyValues(input) as Record<string, unknown>;
    if (isExemptResponsibility(input.costResponsibility)) data.chargedAmount = "0";
    if (input.status === FINALIZED) data.completedAt = sql`now()`;
    if (!fromStock) data.deviceId = null;
    const usePart = input.partFromStock && input.stockAccessoryId;

    try {
      const row = await db.transaction(async (tx) => {
        // Baixa da peça do estoque (se usada), travando a linha
        if (usePart) {
          const accId = input.stockAccessoryId!;
          const [acc] = await tx
            .select({ quantity: accessories.quantity })
            .from(accessories)
            .where(eq(accessories.id, accId))
            .for("update")
            .limit(1);
          if (!acc || acc.quantity < 1) {
            throw osError("Peça sem estoque disponível.", 409);
          }
          await tx
            .update(accessories)
            .set({ quantity: acc.quantity - 1 })
            .where(eq(accessories.id, accId));
          await tx.insert(stockMovements).values({
            productType: "accessory",
            productId: accId,
            movementType: "saida",
            quantity: 1,
            reason: "Peça de OS",
            userId,
          });
        }

        // Já gera o id da OS para o vínculo com o aparelho
        const osId = crypto.randomUUID();
        data.id = osId;
        if (fromStock) {
          // Aparelho do estoque: sempre valida contra o banco (não confia no que veio do navegador)
          const taken = await takeDevice(tx, input.deviceId!, osId, userId);
          const d = taken.dev;
          data.model = deviceLabel(d);
          data.color = d.color;
          data.serialImei = d.serialImei ?? "";
          data.imei2 = d.imei2 ?? "";
          data.serial = d.serial ?? "";
          data.batteryHealth = d.batteryHealth;
          data.prevDeviceStatus = taken.prevStatus;
          data.prevDeviceLocation = taken.prevLocation;
          if (!input.customerName.trim()) data.customerName = STORE_ORIGIN;
        }
        const [created] = await tx.insert(serviceOrders).values(data as never).returning();
        return created;
      });

      if (fromStock) {
        await logAudit(req, {
          action: "os.create_from_stock",
          entity: "service_order",
          entityId: row.id,
          description: `Abriu OS ${shortId(row.id)} para o aparelho de estoque ${row.model}`,
          details: { deviceId: row.deviceId },
        });
      }
      const initialEvent = EVENT_BY_STATUS[row.status];
      const notification = initialEvent ? await notifyOs(row.id, initialEvent, { userId, manual: false }) : null;
      return reply.code(201).send({
        serviceOrder: { ...row, sentEvents: await sentEventsFor(row.id) },
        notification,
      });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 409) return reply.code(409).send({ error: (err as Error).message });
      throw err;
    }
  });

  // PATCH /service-orders/:id
  app.patch("/service-orders/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    }
    // partial() mantém os defaults do zod; só vale o que o cliente enviou de fato
    const sent = new Set(Object.keys((req.body as object) ?? {}));
    const input = Object.fromEntries(
      Object.entries(parsed.data).filter(([k]) => sent.has(k))
    ) as Partial<z.infer<typeof patchSchema>>;
    const userId = (req.user as JwtUser).sub;

    try {
      const result = await db.transaction(async (tx) => {
        const [cur] = await tx.select().from(serviceOrders).where(eq(serviceOrders.id, id)).for("update").limit(1);
        if (!cur) throw osError("OS não encontrada", 404);

        const data = toMoneyValues(input) as Record<string, unknown>;
        const newStatus = input.status ?? cur.status;
        const resp = input.costResponsibility ?? cur.costResponsibility;
        // Garantia / cortesia: nada é cobrado do cliente
        if (isExemptResponsibility(resp)) data.chargedAmount = "0";
        if (cur.origin !== STORE_ORIGIN && input.customerName !== undefined && !input.customerName.trim()) {
          throw osError("Informe o cliente.", 400);
        }
        if (cur.origin !== STORE_ORIGIN && input.model !== undefined && !input.model.trim()) {
          throw osError("Informe o modelo.", 400);
        }
        data.updatedAt = sql`now()`;

        const wasOpen = cur.status !== FINALIZED;
        const willOpen = newStatus !== FINALIZED;
        if (wasOpen && !willOpen) {
          data.completedAt = sql`now()`;
          if (cur.origin === STORE_ORIGIN) await releaseDevice(tx, cur, userId);
        } else if (!wasOpen && willOpen) {
          data.completedAt = null; // OS reaberta
          if (cur.origin === STORE_ORIGIN && cur.deviceId) {
            const taken = await takeDevice(tx, cur.deviceId, cur.id, userId);
            data.prevDeviceStatus = taken.prevStatus;
            data.prevDeviceLocation = taken.prevLocation;
          }
        }

        const [row] = await tx.update(serviceOrders).set(data as never).where(eq(serviceOrders.id, id)).returning();
        return { row, statusChanged: newStatus !== cur.status, newStatus };
      });

      const event = result.statusChanged ? EVENT_BY_STATUS[result.newStatus] : undefined;
      const notification = event ? await notifyOs(id, event, { userId, manual: false }) : null;
      return {
        serviceOrder: { ...result.row, sentEvents: await sentEventsFor(id) },
        notification,
      };
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 409 || code === 400) {
        return reply.code(code).send({ error: (err as Error).message });
      }
      throw err;
    }
  });

  // DELETE /service-orders/:id (somente admin). OS aberta de aparelho do estoque devolve o aparelho.
  app.delete("/service-orders/:id", { preHandler: requireRole("admin") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const userId = (req.user as JwtUser).sub;
    const removed = await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(serviceOrders).where(eq(serviceOrders.id, id)).for("update").limit(1);
      if (!cur) return null;
      if (cur.origin === STORE_ORIGIN && cur.status !== FINALIZED) await releaseDevice(tx, cur, userId);
      await tx.delete(serviceOrders).where(eq(serviceOrders.id, id));
      return cur;
    });
    if (!removed) return reply.code(404).send({ error: "OS não encontrada" });
    await logAudit(req, {
      action: "os.delete",
      entity: "service_order",
      entityId: id,
      description: `Excluiu a OS ${shortId(id)} (${removed.customerName} — ${removed.model})`,
      details: { status: removed.status, origin: removed.origin, deviceId: removed.deviceId },
    });
    return { ok: true };
  });

  // GET /service-orders/:id/notifications — histórico da OS
  app.get("/service-orders/:id/notifications", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const rows = await db
      .select({
        id: osNotifications.id,
        osId: osNotifications.osId,
        event: osNotifications.event,
        phone: osNotifications.phone,
        message: osNotifications.message,
        status: osNotifications.status,
        error: osNotifications.error,
        createdAt: osNotifications.createdAt,
        createdByName: profiles.name,
      })
      .from(osNotifications)
      .leftJoin(profiles, eq(profiles.id, osNotifications.createdBy))
      .where(eq(osNotifications.osId, id))
      .orderBy(desc(osNotifications.createdAt));
    return { notifications: rows };
  });

  // POST /service-orders/:id/notify { event? } — "Notificar agora" / reenviar
  app.post("/service-orders/:id/notify", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const p = z.object({ event: z.enum(OS_EVENTS as [string, ...string[]]).optional() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "Evento inválido" });
    const [os] = await db.select({ status: serviceOrders.status }).from(serviceOrders).where(eq(serviceOrders.id, id)).limit(1);
    if (!os) return reply.code(404).send({ error: "OS não encontrada" });
    const event = (p.data.event as (typeof OS_EVENTS)[number] | undefined) ?? EVENT_BY_STATUS[os.status];
    if (!event) {
      return reply.code(400).send({ error: "Esta etapa da OS não tem mensagem automática. Escolha qual aviso enviar." });
    }
    const result = await notifyOs(id, event, { userId: (req.user as JwtUser).sub, manual: true });
    if (!result) return reply.code(500).send({ error: "Não foi possível registrar a notificação." });
    return { notification: result, sentEvents: await sentEventsFor(id) };
  });

  // GET /os-notifications?status=&limit= — histórico geral
  app.get("/os-notifications", async (req, reply) => {
    const q = z
      .object({
        status: z.enum(["sent", "failed", "pending"]).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "Filtro inválido" });
    const rows = await db
      .select({
        id: osNotifications.id,
        osId: osNotifications.osId,
        event: osNotifications.event,
        phone: osNotifications.phone,
        message: osNotifications.message,
        status: osNotifications.status,
        error: osNotifications.error,
        createdAt: osNotifications.createdAt,
        createdByName: profiles.name,
        customerName: serviceOrders.customerName,
        model: serviceOrders.model,
      })
      .from(osNotifications)
      .innerJoin(serviceOrders, eq(serviceOrders.id, osNotifications.osId))
      .leftJoin(profiles, eq(profiles.id, osNotifications.createdBy))
      .where(q.data.status ? eq(osNotifications.status, q.data.status) : undefined)
      .orderBy(desc(osNotifications.createdAt))
      .limit(q.data.limit);
    return { notifications: rows };
  });
}
