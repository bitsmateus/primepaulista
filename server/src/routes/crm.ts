import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { funnelColumns, leads, leadTasks, messageLogs } from "../db/schema/index";
import { authenticate, requireCapability } from "../plugins/auth";
import { logAudit } from "../services/audit";
import { foldText } from "../lib/crmText";
import { entryStageName, findOrCreateLeadByPhone, listFunnelColumns, restoreDefaultColumns } from "../services/leadFunnel";

const validDate = (v: string) => !Number.isNaN(new Date(v).getTime());

const leadInput = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(30).optional().default(""),
  modelInterest: z.string().max(100).optional().default(""),
  origin: z.string().max(100).optional().default(""),
  status: z.string().max(100).optional(), // sem status: entra na etapa de entrada do funil ("Novo Lead")
  notes: z.string().max(2000).optional().default(""),
});

const messageLogInput = z.object({
  recipientId: z.string().uuid().optional().nullable(),
  recipientName: z.string().max(200).optional().default(""),
  recipientPhone: z.string().max(30).optional().default(""),
  templateType: z.string().max(100).optional().default(""),
  message: z.string().max(4000).optional().default(""),
  status: z.enum(["sent", "failed", "pending"]).optional().default("sent"),
});

// Tarefa nova: para um lead existente (leadId) OU a partir de um contato (cliente/orçamento da Agenda):
// o servidor acha o lead pelo telefone ou cria um.
const taskInput = z
  .object({
    leadId: z.string().uuid().optional(),
    contact: z
      .object({
        name: z.string().trim().max(200).optional().default(""),
        phone: z.string().trim().min(8).max(30),
        origin: z.string().trim().max(100).optional(),
        stage: z.string().trim().max(60).optional(),
      })
      .optional(),
    title: z.string().trim().min(1).max(300),
    dueDate: z.string().refine(validDate, "Data inválida").optional(),
    sourceKey: z.string().trim().max(160).optional(),
    done: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.leadId) !== Boolean(v.contact), "Informe leadId ou contact");

export async function crmRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  // Todo o CRM exige useCRM. Exceção de compatibilidade: a LEITURA de leads também é liberada
  // a quem edita OS (o técnico usa os leads para sugerir clientes ao abrir uma ordem de serviço).
  const crmGuard = requireCapability("useCRM");
  const leadsReadGuard = requireCapability("useCRM", "editOS");
  app.addHook("preHandler", async (req, reply) => {
    const guard = req.method === "GET" && req.routeOptions.url === "/leads" ? leadsReadGuard : crmGuard;
    return guard(req, reply);
  });

  // ===== Colunas do funil =====
  // Instalação nova já nasce com as 10 etapas padrão; bancos existentes só ganham as que faltam
  // pelo botão "Restaurar etapas padrão" (POST /funnel-columns/restore-defaults).
  app.get("/funnel-columns", async () => {
    return { funnelColumns: await listFunnelColumns() };
  });

  const colorSchema = z.string().trim().regex(/^\d{1,3}(\.\d+)? \d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/, "Cor inválida");
  const colNameSchema = z.string().trim().min(1).max(60);

  app.post("/funnel-columns", async (req, reply) => {
    const p = z.object({ name: colNameSchema, color: colorSchema }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const existing = await db.select({ name: funnelColumns.name }).from(funnelColumns);
    if (existing.some((c) => foldText(c.name) === foldText(p.data.name))) {
      return reply.code(409).send({ error: "Já existe uma etapa com esse nome" });
    }
    const [agg] = await db
      .select({ max: sql<number>`coalesce(max(${funnelColumns.position}), -1)` })
      .from(funnelColumns);
    const [row] = await db
      .insert(funnelColumns)
      .values({ name: p.data.name, color: p.data.color, position: Number(agg.max) + 1 })
      .returning();
    return reply.code(201).send({ funnelColumn: row });
  });

  // Restaurar etapas padrão: cria só as que faltam (por nome), sem apagar nem renomear nada
  app.post("/funnel-columns/restore-defaults", async (req) => {
    const r = await restoreDefaultColumns();
    await logAudit(req, {
      action: "funnel.restore_defaults",
      entity: "funnel",
      description: r.created.length
        ? `Restaurou as etapas padrão do funil (criou: ${r.created.join(", ")})`
        : "Restaurou as etapas padrão do funil (nenhuma faltava)",
      details: { created: r.created },
    });
    return { created: r.created, funnelColumns: r.columns };
  });

  // Reordenar: recebe TODOS os ids na nova ordem
  app.post("/funnel-columns/reorder", async (req, reply) => {
    const p = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const rows = await db.select({ id: funnelColumns.id }).from(funnelColumns);
    const have = new Set(rows.map((r) => r.id));
    const given = new Set(p.data.ids);
    if (given.size !== p.data.ids.length || given.size !== have.size || [...given].some((id) => !have.has(id))) {
      return reply.code(400).send({ error: "A lista precisa ter todas as etapas, sem repetir" });
    }
    await db.transaction(async (tx) => {
      for (let i = 0; i < p.data.ids.length; i++) {
        await tx.update(funnelColumns).set({ position: i }).where(eq(funnelColumns.id, p.data.ids[i]));
      }
    });
    return { funnelColumns: await listFunnelColumns() };
  });

  // Renomear/alterar coluna (renomear também atualiza o status dos leads)
  app.patch("/funnel-columns/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const p = z
      .object({
        name: colNameSchema.optional(),
        color: colorSchema.optional(),
        position: z.number().int().min(0).max(1000).optional(),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });

    const result = await db.transaction(async (tx) => {
      const [old] = await tx.select().from(funnelColumns).where(eq(funnelColumns.id, id)).limit(1);
      if (!old) return "404" as const;
      if (p.data.name && p.data.name !== old.name) {
        const others = await tx.select({ name: funnelColumns.name }).from(funnelColumns).where(ne(funnelColumns.id, id));
        if (others.some((c) => foldText(c.name) === foldText(p.data.name!))) return "409" as const;
        await tx.update(leads).set({ status: p.data.name }).where(eq(leads.status, old.name));
      }
      if (Object.keys(p.data).length > 0) await tx.update(funnelColumns).set(p.data).where(eq(funnelColumns.id, id));
      return "ok" as const;
    });
    if (result === "404") return reply.code(404).send({ error: "Coluna não encontrada" });
    if (result === "409") return reply.code(409).send({ error: "Já existe uma etapa com esse nome" });
    const [row] = await db.select().from(funnelColumns).where(eq(funnelColumns.id, id)).limit(1);
    return { funnelColumn: row };
  });

  // Remover coluna: só se estiver vazia (e nunca a última)
  app.delete("/funnel-columns/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const [col] = await db.select().from(funnelColumns).where(eq(funnelColumns.id, id)).limit(1);
    if (!col) return reply.code(404).send({ error: "Coluna não encontrada" });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(eq(leads.status, col.name));
    if (Number(n) > 0) {
      return reply.code(409).send({ error: `A etapa "${col.name}" ainda tem ${n} lead(s). Mova-os para outra etapa antes de remover.` });
    }
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(funnelColumns);
    if (Number(total) <= 1) return reply.code(409).send({ error: "O funil precisa ter pelo menos uma etapa." });
    await db.delete(funnelColumns).where(eq(funnelColumns.id, id));
    return { ok: true };
  });

  // ===== Leads =====
  app.get("/leads", async () => {
    const rows = await db.select().from(leads).orderBy(desc(leads.createdAt));
    return { leads: rows };
  });

  app.post("/leads", async (req, reply) => {
    const p = leadInput.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const user = req.user as { sub: string; name: string };
    const status = p.data.status || (await entryStageName());
    const [row] = await db
      .insert(leads)
      .values({ ...p.data, status, ownerId: user.sub, ownerName: user.name })
      .returning();
    return reply.code(201).send({ lead: row });
  });

  app.patch("/leads/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = leadInput.partial().safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const [row] = await db.update(leads).set(p.data).where(eq(leads.id, id)).returning();
    if (!row) return reply.code(404).send({ error: "Lead não encontrado" });
    return { lead: row };
  });

  app.delete("/leads/:id", async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(leads).where(eq(leads.id, id));
    return { ok: true };
  });

  // ===== Tarefas / follow-up de leads =====
  app.get("/lead-tasks", async () => {
    const rows = await db.select().from(leadTasks).orderBy(asc(leadTasks.dueDate));
    return { tasks: rows };
  });

  app.post("/lead-tasks", async (req, reply) => {
    const p = taskInput.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message || "Dados inválidos" });
    const user = req.user as { sub: string; name: string };
    let leadId = p.data.leadId;
    let leadCreated = false;
    if (leadId) {
      const [l] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!l) return reply.code(404).send({ error: "Lead não encontrado" });
    } else if (p.data.contact) {
      const c = p.data.contact;
      const r = await findOrCreateLeadByPhone({
        phone: c.phone,
        name: c.name,
        origin: c.origin || "Cliente",
        stage: c.stage,
        ownerId: user.sub,
        ownerName: user.name,
      });
      leadId = r.lead.id;
      leadCreated = r.created;
    }
    const [row] = await db
      .insert(leadTasks)
      .values({
        leadId: leadId!,
        title: p.data.title,
        done: p.data.done ?? false,
        sourceKey: p.data.sourceKey ?? null,
        ...(p.data.dueDate ? { dueDate: new Date(p.data.dueDate) } : {}),
      })
      .returning();
    return reply.code(201).send({ task: row, leadId, leadCreated });
  });

  // Concluir, renomear ou reagendar (dueDate null = sem data)
  app.patch("/lead-tasks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const p = z
      .object({
        done: z.boolean().optional(),
        title: z.string().trim().min(1).max(300).optional(),
        dueDate: z.string().refine(validDate, "Data inválida").nullable().optional(),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const { dueDate, ...rest } = p.data;
    const set = { ...rest, ...(dueDate !== undefined ? { dueDate: dueDate === null ? null : new Date(dueDate) } : {}) };
    if (Object.keys(set).length === 0) return reply.code(400).send({ error: "Nada para alterar" });
    const [row] = await db.update(leadTasks).set(set).where(eq(leadTasks.id, id)).returning();
    if (!row) return reply.code(404).send({ error: "Tarefa não encontrada" });
    return { task: row };
  });

  app.delete("/lead-tasks/:id", async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(leadTasks).where(eq(leadTasks.id, id));
    return { ok: true };
  });

  // ===== Logs de mensagens =====
  // Os 5000 mais recentes (enviadas e recebidas)
  app.get("/message-logs", async () => {
    const rows = await db.select().from(messageLogs).orderBy(desc(messageLogs.sentAt)).limit(5000);
    return { messageLogs: rows };
  });

  // Marca como vistas as mensagens recebidas de um lead (some do contador "Mensagens novas")
  app.post("/leads/:id/messages/read", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const rows = await db
      .update(messageLogs)
      .set({ readAt: new Date() })
      .where(and(eq(messageLogs.recipientId, id), eq(messageLogs.direction, "in"), sql`${messageLogs.readAt} is null`))
      .returning({ id: messageLogs.id });
    return { marked: rows.length };
  });

  app.post("/message-logs", async (req, reply) => {
    const p = messageLogInput.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const [row] = await db.insert(messageLogs).values(p.data).returning();
    return reply.code(201).send({ messageLog: row });
  });
}
