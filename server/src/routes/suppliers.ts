import type { FastifyInstance } from "fastify";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { accountsPayable, devices, suppliers } from "../db/schema/index";
import { authenticate, currentRole, requireCapability } from "../plugins/auth";
import { can } from "../lib/permissions";
import { diffFields, logAudit } from "../services/audit";
import { normName } from "../services/suppliers";

const digits = (s: string) => s.replace(/\D/g, "");

const supplierInput = z.object({
  name: z.string().trim().min(1, "Informe o nome do fornecedor").max(160),
  // CNPJ (14) ou CPF (11), só dígitos; vazio = não informado
  document: z
    .string()
    .max(30)
    .optional()
    .default("")
    .transform(digits)
    .refine((v) => v === "" || v.length === 11 || v.length === 14, "CPF/CNPJ inválido"),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().max(160).optional().default("").refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "E-mail inválido"),
  address: z.string().trim().max(300).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  active: z.boolean().optional().default(true),
});

async function nameTaken(name: string, exceptId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(sql`lower(btrim(${suppliers.name})) = ${normName(name)}`);
  return rows.some((r) => r.id !== exceptId);
}

export async function supplierRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /suppliers?q=&active=  — lista (com contagem de aparelhos e contas). Base de todos os seletores.
  app.get("/suppliers", { preHandler: requireCapability("viewStock") }, async (req, reply) => {
    const q = z
      .object({ q: z.string().max(100).optional(), active: z.enum(["true", "false"]).optional() })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "Filtros inválidos" });
    const conds = [];
    if (q.data.active) conds.push(eq(suppliers.active, q.data.active === "true"));
    if (q.data.q) {
      const like = `%${q.data.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      conds.push(or(ilike(suppliers.name, like), ilike(suppliers.document, like), ilike(suppliers.phone, like), ilike(suppliers.email, like)));
    }
    const rows = await db
      .select({
        s: suppliers,
        // subconsultas com tabelas por nome (o Drizzle omite o prefixo da tabela em consultas simples)
        deviceCount: sql<number>`(select count(*)::int from devices d where d.supplier_id = suppliers.id)`,
        payableCount: sql<number>`(select count(*)::int from accounts_payable p where p.supplier_id = suppliers.id)`,
      })
      .from(suppliers)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(suppliers.name);
    return { suppliers: rows.map((r) => ({ ...r.s, deviceCount: r.deviceCount, payableCount: r.payableCount })) };
  });

  // GET /suppliers/:id — ficha: aparelhos comprados e contas a pagar.
  // Custo/total comprado só para quem vê custo; contas a pagar só para quem gerencia o financeiro.
  app.get("/suppliers/:id", { preHandler: requireCapability("viewSuppliers") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    if (!s) return reply.code(404).send({ error: "Fornecedor não encontrado" });
    const role = currentRole(req);
    const showCost = can(role, "viewCost");
    const showFinance = can(role, "manageFinance");

    const devs = await db
      .select({
        id: devices.id,
        model: devices.model,
        capacity: devices.capacity,
        color: devices.color,
        condition: devices.condition,
        status: devices.status,
        serialImei: devices.serialImei,
        entryDate: devices.entryDate,
        createdAt: devices.createdAt,
        cost: devices.cost,
      })
      .from(devices)
      .where(eq(devices.supplierId, id))
      .orderBy(desc(devices.createdAt));
    const pays = showFinance
      ? await db.select().from(accountsPayable).where(eq(accountsPayable.supplierId, id)).orderBy(desc(accountsPayable.createdAt))
      : [];

    const totalPurchased = devs.reduce((sum, d) => sum + Number(d.cost), 0);
    return {
      supplier: s,
      devices: devs.map((d) => (showCost ? d : { ...d, cost: undefined })),
      payables: pays,
      deviceCount: devs.length,
      ...(showCost ? { totalPurchased } : {}),
      ...(showFinance
        ? { payablesOpen: pays.filter((p) => p.status !== "pago").reduce((sum, p) => sum + Number(p.amount), 0) }
        : {}),
    };
  });

  // POST /suppliers
  app.post("/suppliers", { preHandler: requireCapability("manageSuppliers") }, async (req, reply) => {
    const p = supplierInput.safeParse(req.body);
    if (!p.success) {
      return reply.code(400).send({ error: p.error.issues[0]?.message ?? "Dados inválidos", details: p.error.flatten().fieldErrors });
    }
    if (await nameTaken(p.data.name)) {
      return reply.code(409).send({ error: "Já existe um fornecedor com este nome." });
    }
    const [row] = await db.insert(suppliers).values(p.data).returning();
    await logAudit(req, {
      action: "supplier.create",
      entity: "supplier",
      entityId: row.id,
      description: `Cadastrou o fornecedor ${row.name}`,
    });
    return reply.code(201).send({ supplier: { ...row, deviceCount: 0, payableCount: 0 } });
  });

  // PATCH /suppliers/:id — editar / inativar / reativar
  app.patch("/suppliers/:id", { preHandler: requireCapability("manageSuppliers") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const p = supplierInput.partial().safeParse(req.body);
    if (!p.success) {
      return reply.code(400).send({ error: p.error.issues[0]?.message ?? "Dados inválidos" });
    }
    if (Object.keys(p.data).length === 0) return reply.code(400).send({ error: "Nada para atualizar." });
    const [before] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    if (!before) return reply.code(404).send({ error: "Fornecedor não encontrado" });
    if (p.data.name !== undefined && (await nameTaken(p.data.name, id))) {
      return reply.code(409).send({ error: "Já existe um fornecedor com este nome." });
    }
    const [row] = await db.update(suppliers).set(p.data).where(eq(suppliers.id, id)).returning();
    // Mantém o nome exibido nos aparelhos em dia
    if (p.data.name !== undefined && p.data.name !== before.name) {
      await db.update(devices).set({ supplier: row.name }).where(eq(devices.supplierId, id));
    }
    const changes = diffFields(before as Record<string, unknown>, p.data as Record<string, unknown>, [
      "name", "document", "phone", "email", "address", "notes", "active",
    ]);
    if (p.data.active !== undefined && p.data.active !== before.active) {
      await logAudit(req, {
        action: row.active ? "supplier.reactivate" : "supplier.inactivate",
        entity: "supplier",
        entityId: id,
        description: `${row.active ? "Reativou" : "Inativou"} o fornecedor ${row.name}`,
      });
      delete changes.active;
    }
    if (Object.keys(changes).length) {
      await logAudit(req, {
        action: "supplier.update",
        entity: "supplier",
        entityId: id,
        description: `Editou o fornecedor ${row.name} (${Object.keys(changes).join(", ")})`,
        details: changes,
      });
    }
    return { supplier: row };
  });

  // DELETE /suppliers/:id — bloqueado se houver aparelhos/contas ligados (nesse caso, inativar)
  app.delete("/suppliers/:id", { preHandler: requireCapability("deleteRecords") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    if (!s) return reply.code(404).send({ error: "Fornecedor não encontrado" });
    const [{ dev }] = await db.select({ dev: sql<number>`count(*)::int` }).from(devices).where(eq(devices.supplierId, id));
    const [{ pay }] = await db.select({ pay: sql<number>`count(*)::int` }).from(accountsPayable).where(eq(accountsPayable.supplierId, id));
    if (dev > 0 || pay > 0) {
      return reply.code(409).send({
        error: `Este fornecedor tem ${dev} aparelho(s) e ${pay} conta(s) a pagar ligados e não pode ser excluído. Inative-o para tirá-lo das listas.`,
        deviceCount: dev,
        payableCount: pay,
      });
    }
    await db.delete(suppliers).where(eq(suppliers.id, id));
    await logAudit(req, {
      action: "supplier.delete",
      entity: "supplier",
      entityId: id,
      description: `Excluiu o fornecedor ${s.name}`,
    });
    return { ok: true };
  });
}

