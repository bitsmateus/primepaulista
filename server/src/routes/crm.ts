import type { FastifyInstance } from "fastify";
import { asc, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { funnelColumns, leads, messageLogs } from "../db/schema/index";
import { authenticate } from "../plugins/auth";

const DEFAULT_COLUMNS = [
  { name: "Novo", color: "211 100% 45%", position: 0 },
  { name: "Contatado", color: "38 92% 50%", position: 1 },
  { name: "Negociação", color: "25 95% 53%", position: 2 },
  { name: "Convertido", color: "160 84% 39%", position: 3 },
  { name: "Perdido", color: "0 84% 60%", position: 4 },
];

const leadInput = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(30).optional().default(""),
  modelInterest: z.string().max(100).optional().default(""),
  origin: z.string().max(100).optional().default(""),
  status: z.string().max(100).optional().default("Novo"),
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

export async function crmRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ===== Colunas do funil =====
  app.get("/funnel-columns", async () => {
    let rows = await db
      .select()
      .from(funnelColumns)
      .orderBy(asc(funnelColumns.position));
    if (rows.length === 0) {
      await db.insert(funnelColumns).values(DEFAULT_COLUMNS);
      rows = await db.select().from(funnelColumns).orderBy(asc(funnelColumns.position));
    }
    return { funnelColumns: rows };
  });

  app.post("/funnel-columns", async (req, reply) => {
    const p = z
      .object({ name: z.string().min(1), color: z.string().min(1) })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const [agg] = await db
      .select({ max: sql<number>`coalesce(max(${funnelColumns.position}), -1)` })
      .from(funnelColumns);
    const [row] = await db
      .insert(funnelColumns)
      .values({ name: p.data.name, color: p.data.color, position: Number(agg.max) + 1 })
      .returning();
    return reply.code(201).send({ funnelColumn: row });
  });

  // Renomear/alterar coluna (renomear também atualiza o status dos leads)
  app.patch("/funnel-columns/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({
        name: z.string().min(1).optional(),
        color: z.string().optional(),
        position: z.number().int().optional(),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });

    await db.transaction(async (tx) => {
      const [old] = await tx
        .select()
        .from(funnelColumns)
        .where(eq(funnelColumns.id, id))
        .limit(1);
      if (old && p.data.name && p.data.name !== old.name) {
        await tx.update(leads).set({ status: p.data.name }).where(eq(leads.status, old.name));
      }
      await tx.update(funnelColumns).set(p.data).where(eq(funnelColumns.id, id));
    });
    const [row] = await db
      .select()
      .from(funnelColumns)
      .where(eq(funnelColumns.id, id))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Coluna não encontrada" });
    return { funnelColumn: row };
  });

  // Remover coluna (leads órfãos vão para a primeira coluna restante)
  app.delete("/funnel-columns/:id", async (req) => {
    const { id } = req.params as { id: string };
    await db.transaction(async (tx) => {
      const [col] = await tx
        .select()
        .from(funnelColumns)
        .where(eq(funnelColumns.id, id))
        .limit(1);
      if (!col) return;
      const [first] = await tx
        .select()
        .from(funnelColumns)
        .where(ne(funnelColumns.id, id))
        .orderBy(asc(funnelColumns.position))
        .limit(1);
      if (first) {
        await tx.update(leads).set({ status: first.name }).where(eq(leads.status, col.name));
      }
      await tx.delete(funnelColumns).where(eq(funnelColumns.id, id));
    });
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
    const [row] = await db.insert(leads).values(p.data).returning();
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

  // ===== Logs de mensagens =====
  app.get("/message-logs", async () => {
    const rows = await db.select().from(messageLogs).orderBy(desc(messageLogs.sentAt));
    return { messageLogs: rows };
  });

  app.post("/message-logs", async (req, reply) => {
    const p = messageLogInput.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const [row] = await db.insert(messageLogs).values(p.data).returning();
    return reply.code(201).send({ messageLog: row });
  });
}
