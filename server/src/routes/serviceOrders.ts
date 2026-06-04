import type { FastifyInstance } from "fastify";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { serviceOrders, accessories, stockMovements } from "../db/schema/index";
import { authenticate, requireRole, type JwtUser } from "../plugins/auth";

const osStatus = z.enum([
  "Aguardando Diagnóstico",
  "Aguardando Peça",
  "Em Reparo",
  "Pronto para Retirada",
  "Entregue / Finalizado",
]);

// Wire format = colunas planas (checklist separado), dinheiro como número
const osInput = z.object({
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(1).max(200),
  customerPhone: z.string().max(30).optional().default(""),
  customerCpf: z.string().max(20).optional().default(""),
  model: z.string().min(1).max(100),
  color: z.string().max(60).optional().default(""),
  serialImei: z.string().max(60).optional().default(""),
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

export async function serviceOrderRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /service-orders
  app.get("/service-orders", async () => {
    const rows = await db
      .select()
      .from(serviceOrders)
      .orderBy(desc(serviceOrders.createdAt));
    return { serviceOrders: rows };
  });

  // POST /service-orders
  app.post("/service-orders", async (req, reply) => {
    const parsed = osInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const data = toMoneyValues(parsed.data);
    if (parsed.data.status === "Entregue / Finalizado") {
      data.completedAt = sql`now()`;
    }
    const usePart = parsed.data.partFromStock && parsed.data.stockAccessoryId;

    try {
      const row = await db.transaction(async (tx) => {
        // Baixa da peça do estoque (se usada), travando a linha
        if (usePart) {
          const accId = parsed.data.stockAccessoryId!;
          const [acc] = await tx
            .select({ quantity: accessories.quantity })
            .from(accessories)
            .where(eq(accessories.id, accId))
            .for("update")
            .limit(1);
          if (!acc || acc.quantity < 1) {
            throw Object.assign(new Error("Peça sem estoque disponível."), {
              statusCode: 409,
            });
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
            userId: (req.user as JwtUser).sub,
          });
        }
        const [created] = await tx.insert(serviceOrders).values(data as never).returning();
        return created;
      });
      return reply.code(201).send({ serviceOrder: row });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 409) return reply.code(409).send({ error: (err as Error).message });
      throw err;
    }
  });

  // PATCH /service-orders/:id
  app.patch("/service-orders/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = osInput.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos" });
    }
    const data = toMoneyValues(parsed.data) as Record<string, unknown>;
    data.updatedAt = sql`now()`;
    // Ao finalizar, carimba a data de conclusão
    if (parsed.data.status === "Entregue / Finalizado") {
      data.completedAt = sql`now()`;
    }
    const [row] = await db
      .update(serviceOrders)
      .set(data as never)
      .where(eq(serviceOrders.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "OS não encontrada" });
    return { serviceOrder: row };
  });

  // DELETE /service-orders/:id (somente admin)
  app.delete("/service-orders/:id", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(serviceOrders).where(eq(serviceOrders.id, id));
    return { ok: true };
  });
}
