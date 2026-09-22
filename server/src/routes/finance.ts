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
  suppliers,
} from "../db/schema/index";
import { brl, logAudit } from "../services/audit";
import { authenticate, requireCapability, type JwtUser } from "../plugins/auth";

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
  // Financeiro: quem tem a capacidade manageFinance (admin, gerente, financeiro)
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireCapability("manageFinance"));

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
    await logAudit(req, {
      action: "expense.create",
      entity: "expense",
      entityId: row.id,
      description: `Lançou a despesa "${row.description}" de ${brl(row.amount)}`,
      details: { category: row.category, amount: row.amount, recurring: row.recurring },
    });
    return reply.code(201).send({ expense: row });
  });

  app.delete("/expenses/:id", async (req) => {
    const { id } = req.params as { id: string };
    const [old] = await db.delete(expenses).where(eq(expenses.id, id)).returning();
    if (old) {
      await logAudit(req, {
        action: "expense.delete",
        entity: "expense",
        entityId: id,
        description: `Excluiu a despesa "${old.description}" de ${brl(old.amount)}`,
        details: { category: old.category, amount: old.amount },
      });
    }
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
    await logAudit(req, {
      action: "sangria.create",
      entity: "sangria",
      entityId: row.id,
      description: `Registrou uma sangria de ${brl(row.amount)}${row.justification ? ` (${row.justification})` : ""}`,
      details: { amount: row.amount },
    });
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
    await logAudit(req, {
      action: "commission.update",
      entity: "commission",
      entityId: sellerName,
      description: `Alterou a comissão de ${sellerName}: aparelhos ${row.devicePercent}%, acessórios ${row.accessoryPercent}%`,
      details: { devicePercent: row.devicePercent, accessoryPercent: row.accessoryPercent },
    });
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
    await logAudit(req, {
      action: "receivable.create",
      entity: "receivable",
      entityId: row.id,
      description: `Criou uma conta a receber de ${brl(row.amount)}`,
      details: { amount: row.amount },
    });
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
    await logAudit(req, {
      action: "receivable.update",
      entity: "receivable",
      entityId: id,
      description: `Marcou a conta a receber de ${brl(row.amount)} como ${row.status}`,
      details: { status: row.status },
    });
    return { receivable: row };
  });

  app.delete("/receivables/:id", async (req) => {
    const { id } = req.params as { id: string };
    const [old] = await db.delete(accountsReceivable).where(eq(accountsReceivable.id, id)).returning();
    if (old) {
      await logAudit(req, {
        action: "receivable.delete",
        entity: "receivable",
        entityId: id,
        description: `Excluiu a conta a receber de ${brl(old.amount)}`,
        details: { amount: old.amount, status: old.status },
      });
    }
    return { ok: true };
  });

  // ===== Contas a pagar =====
  app.get("/payables", async () => {
    const rows = await db
      .select({ p: accountsPayable, supplierName: suppliers.name })
      .from(accountsPayable)
      .leftJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
      .orderBy(desc(accountsPayable.createdAt));
    return { payables: rows.map((r) => ({ ...r.p, supplierName: r.supplierName ?? null })) };
  });

  app.post("/payables", async (req, reply) => {
    const p = z
      .object({
        description: z.string().min(1).max(300),
        category: z.string().max(100).optional().default(""),
        amount: z.coerce.number().min(0),
        dueDate: z.string().optional(),
        recurring: z.boolean().optional().default(false),
        supplierId: z.string().uuid().nullable().optional(),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    let supplierName: string | null = null;
    if (p.data.supplierId) {
      const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, p.data.supplierId)).limit(1);
      if (!sup) return reply.code(400).send({ error: "Fornecedor não encontrado." });
      supplierName = sup.name;
    }
    const [row] = await db
      .insert(accountsPayable)
      .values({
        description: p.data.description,
        category: p.data.category,
        amount: String(p.data.amount),
        recurring: p.data.recurring,
        supplierId: p.data.supplierId ?? null,
        ...(p.data.dueDate ? { dueDate: new Date(p.data.dueDate) } : {}),
      })
      .returning();
    await logAudit(req, {
      action: "payable.create",
      entity: "payable",
      entityId: row.id,
      description: `Criou a conta a pagar "${row.description}" de ${brl(row.amount)}${supplierName ? ` (fornecedor ${supplierName})` : ""}`,
      details: { amount: row.amount, category: row.category, supplierId: row.supplierId },
    });
    return reply.code(201).send({ payable: { ...row, supplierName } });
  });

  app.patch("/payables/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({
        status: z.enum(["pendente", "pago", "atrasado"]).optional(),
        supplierId: z.string().uuid().nullable().optional(),
      })
      .refine((v) => v.status !== undefined || v.supplierId !== undefined)
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    if (p.data.supplierId) {
      const [sup] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, p.data.supplierId)).limit(1);
      if (!sup) return reply.code(400).send({ error: "Fornecedor não encontrado." });
    }
    const set: Record<string, unknown> = {};
    if (p.data.status !== undefined) {
      set.status = p.data.status;
      set.paidAt = p.data.status === "pago" ? new Date() : null;
    }
    if (p.data.supplierId !== undefined) set.supplierId = p.data.supplierId;
    const [row] = await db
      .update(accountsPayable)
      .set(set)
      .where(eq(accountsPayable.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Conta não encontrada" });
    await logAudit(req, {
      action: "payable.update",
      entity: "payable",
      entityId: id,
      description: `Atualizou a conta a pagar "${row.description}" de ${brl(row.amount)}${p.data.status ? ` para ${row.status}` : ""}`,
      details: { status: row.status, supplierId: row.supplierId },
    });
    return { payable: row };
  });

  app.delete("/payables/:id", async (req) => {
    const { id } = req.params as { id: string };
    const [old] = await db.delete(accountsPayable).where(eq(accountsPayable.id, id)).returning();
    if (old) {
      await logAudit(req, {
        action: "payable.delete",
        entity: "payable",
        entityId: id,
        description: `Excluiu a conta a pagar "${old.description}" de ${brl(old.amount)}`,
        details: { amount: old.amount, status: old.status },
      });
    }
    return { ok: true };
  });
}
