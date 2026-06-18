import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import {
  expenses,
  sangrias,
  sellerCommissions,
  accountsReceivable,
  accountsPayable,
} from "../db/schema/index";
import { authenticate, requireRole, type JwtUser } from "../plugins/auth";

const EXPENSE_CATEGORIES = [
  "Aluguel",
  "Condomínio",
  "Impostos (MEI)",
  "Tráfego Pago",
  "Salários",
  "Pro-labore",
  "Outros",
] as const;

const DEFAULT_COMMISSIONS = [
  { sellerName: "Gabriel", devicePercent: "3", accessoryPercent: "10" },
  { sellerName: "Matheus", devicePercent: "3", accessoryPercent: "10" },
  { sellerName: "Tassio", devicePercent: "3", accessoryPercent: "10" },
];

export async function financeRoutes(app: FastifyInstance) {
  // Financeiro é restrito a administradores
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRole("admin"));

  // ===== Despesas =====
  app.get("/expenses", async () => {
    const rows = await db.select().from(expenses).orderBy(desc(expenses.date));
    return { expenses: rows };
  });

  app.post("/expenses", async (req, reply) => {
    const p = z
      .object({
        description: z.string().min(1).max(300),
        category: z.enum(EXPENSE_CATEGORIES),
        amount: z.coerce.number().min(0),
        date: z.string().optional(),
        recurring: z.boolean().optional().default(false),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const [row] = await db
      .insert(expenses)
      .values({
        description: p.data.description,
        category: p.data.category,
        amount: String(p.data.amount),
        recurring: p.data.recurring,
        ...(p.data.date ? { date: new Date(p.data.date) } : {}),
      })
      .returning();
    return reply.code(201).send({ expense: row });
  });

  app.delete("/expenses/:id", async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(expenses).where(eq(expenses.id, id));
    return { ok: true };
  });

  // ===== Sangrias =====
  app.get("/sangrias", async () => {
    const rows = await db.select().from(sangrias).orderBy(desc(sangrias.date));
    return { sangrias: rows };
  });

  app.post("/sangrias", async (req, reply) => {
    const p = z
      .object({
        amount: z.coerce.number().min(0),
        justification: z.string().max(500).optional().default(""),
        date: z.string().optional(),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const [row] = await db
      .insert(sangrias)
      .values({
        amount: String(p.data.amount),
        justification: p.data.justification,
        userId: (req.user as JwtUser).sub,
        ...(p.data.date ? { date: new Date(p.data.date) } : {}),
      })
      .returning();
    return reply.code(201).send({ sangria: row });
  });

  // ===== Comissões por vendedor =====
  app.get("/seller-commissions", async () => {
    let rows = await db.select().from(sellerCommissions);
    if (rows.length === 0) {
      await db.insert(sellerCommissions).values(DEFAULT_COMMISSIONS);
      rows = await db.select().from(sellerCommissions);
    }
    return { commissions: rows };
  });

  app.put("/seller-commissions/:sellerName", async (req, reply) => {
    const { sellerName } = req.params as { sellerName: string };
    const p = z
      .object({
        devicePercent: z.coerce.number().min(0).optional(),
        accessoryPercent: z.coerce.number().min(0).optional(),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const values: Record<string, string> = {};
    if (p.data.devicePercent !== undefined) values.devicePercent = String(p.data.devicePercent);
    if (p.data.accessoryPercent !== undefined)
      values.accessoryPercent = String(p.data.accessoryPercent);

    // upsert por nome
    const [existing] = await db
      .select()
      .from(sellerCommissions)
      .where(eq(sellerCommissions.sellerName, sellerName))
      .limit(1);
    let row;
    if (existing) {
      [row] = await db
        .update(sellerCommissions)
        .set(values)
        .where(eq(sellerCommissions.sellerName, sellerName))
        .returning();
    } else {
      [row] = await db
        .insert(sellerCommissions)
        .values({ sellerName, ...values })
        .returning();
    }
    return { commission: row };
  });

  // ===== Contas a receber =====
  app.get("/receivables", async () => {
    const rows = await db
      .select()
      .from(accountsReceivable)
      .orderBy(desc(accountsReceivable.createdAt));
    return { receivables: rows };
  });

  app.post("/receivables", async (req, reply) => {
    const p = z
      .object({
        customerId: z.string().uuid().optional().nullable(),
        saleId: z.string().uuid().optional().nullable(),
        amount: z.coerce.number().min(0),
        dueDate: z.string().optional(),
        description: z.string().optional(),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const [row] = await db
      .insert(accountsReceivable)
      .values({
        customerId: p.data.customerId ?? null,
        saleId: p.data.saleId ?? null,
        amount: String(p.data.amount),
        ...(p.data.dueDate ? { dueDate: new Date(p.data.dueDate) } : {}),
      })
      .returning();
    return reply.code(201).send({ receivable: row });
  });

  // Marcar como pago / atualizar status
  app.patch("/receivables/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({ status: z.enum(["pendente", "pago", "atrasado"]) })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const [row] = await db
      .update(accountsReceivable)
      .set({ status: p.data.status, paidAt: p.data.status === "pago" ? new Date() : null })
      .where(eq(accountsReceivable.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Conta não encontrada" });
    return { receivable: row };
  });

  app.delete("/receivables/:id", async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(accountsReceivable).where(eq(accountsReceivable.id, id));
    return { ok: true };
  });

  // ===== Contas a pagar =====
  app.get("/payables", async () => {
    const rows = await db.select().from(accountsPayable).orderBy(desc(accountsPayable.createdAt));
    return { payables: rows };
  });

  app.post("/payables", async (req, reply) => {
    const p = z
      .object({
        description: z.string().min(1).max(300),
        category: z.string().max(100).optional().default(""),
        amount: z.coerce.number().min(0),
        dueDate: z.string().optional(),
        recurring: z.boolean().optional().default(false),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const [row] = await db
      .insert(accountsPayable)
      .values({
        description: p.data.description,
        category: p.data.category,
        amount: String(p.data.amount),
        recurring: p.data.recurring,
        ...(p.data.dueDate ? { dueDate: new Date(p.data.dueDate) } : {}),
      })
      .returning();
    return reply.code(201).send({ payable: row });
  });

  app.patch("/payables/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({ status: z.enum(["pendente", "pago", "atrasado"]) })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const [row] = await db
      .update(accountsPayable)
      .set({ status: p.data.status, paidAt: p.data.status === "pago" ? new Date() : null })
      .where(eq(accountsPayable.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Conta não encontrada" });
    return { payable: row };
  });

  app.delete("/payables/:id", async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(accountsPayable).where(eq(accountsPayable.id, id));
    return { ok: true };
  });
}
