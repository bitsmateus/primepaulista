import type { FastifyInstance } from "fastify";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { customers, quoteItems, quotes } from "../db/schema/index";
import { authenticate, requireCapability, currentRole, type JwtUser } from "../plugins/auth";
import { can } from "../lib/permissions";
import { logAudit } from "../services/audit";

const VALIDITY_DAYS = 7;

const itemInput = z.object({
  productType: z.enum(["device", "accessory"]),
  productId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  serial: z.string().max(80).nullable().optional(),
  price: z.coerce.number().min(0),
  quantity: z.coerce.number().int().min(1).max(999),
});

const quoteInput = z.object({
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().max(120).optional().default(""),
  customerPhone: z.string().trim().max(30).optional().default(""),
  sellerName: z.string().trim().max(120).optional().default(""),
  validUntil: z.coerce.date().optional(),
  discount: z.coerce.number().min(0).default(0),
  paymentTerms: z.string().trim().max(300).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  items: z.array(itemInput).min(1, "Adicione pelo menos um item").max(100),
});

const editableStatus = z.enum(["Aberto", "Enviado", "Aprovado", "Recusado"]);

function defaultValidity(): Date {
  const d = new Date();
  d.setDate(d.getDate() + VALIDITY_DAYS);
  d.setHours(23, 59, 59, 0);
  return d;
}

// Totais sempre recalculados no servidor
function totalsOf(items: { price: number; quantity: number }[], discount: number) {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  return { subtotal, total: Math.max(0, subtotal - discount) };
}

function quoteError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

// Vendedor e admin usam orçamentos; técnico não.
export async function quoteRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireCapability("sell"));

  async function loadWithItems(ids: string[]) {
    if (ids.length === 0) return {} as Record<string, (typeof quoteItems.$inferSelect)[]>;
    const items = await db.select().from(quoteItems).where(inArray(quoteItems.quoteId, ids));
    const map: Record<string, (typeof quoteItems.$inferSelect)[]> = {};
    for (const it of items) (map[it.quoteId] ??= []).push(it);
    return map;
  }

  // GET /quotes
  app.get("/quotes", async () => {
    const rows = await db.select().from(quotes).orderBy(desc(quotes.createdAt));
    const items = await loadWithItems(rows.map((r) => r.id));
    return { quotes: rows.map((q) => ({ ...q, items: items[q.id] ?? [] })) };
  });

  // GET /quotes/:id
  app.get("/quotes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const [q] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
    if (!q) return reply.code(404).send({ error: "Orçamento não encontrado" });
    const items = await loadWithItems([id]);
    return { quote: { ...q, items: items[id] ?? [] } };
  });

  // POST /quotes
  app.post("/quotes", async (req, reply) => {
    const parsed = quoteInput.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message;
      return reply.code(400).send({ error: first || "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const d = parsed.data;
    const user = req.user as JwtUser;

    let customerName = d.customerName;
    let customerPhone = d.customerPhone;
    if (d.customerId) {
      const [c] = await db.select().from(customers).where(eq(customers.id, d.customerId)).limit(1);
      if (!c) return reply.code(400).send({ error: "Cliente não encontrado" });
      customerName = customerName || c.name;
      customerPhone = customerPhone || c.whatsapp || "";
    }
    if (!customerName) return reply.code(400).send({ error: "Informe o cliente" });

    const { subtotal, total } = totalsOf(d.items, d.discount);
    const created = await db.transaction(async (tx) => {
      const [q] = await tx
        .insert(quotes)
        .values({
          customerId: d.customerId ?? null,
          customerName,
          customerPhone,
          sellerId: user.sub,
          sellerName: d.sellerName || user.name,
          validUntil: d.validUntil ?? defaultValidity(),
          subtotal: String(subtotal),
          discount: String(d.discount),
          total: String(total),
          paymentTerms: d.paymentTerms,
          notes: d.notes,
        })
        .returning();
      const items = await tx
        .insert(quoteItems)
        .values(
          d.items.map((i) => ({
            quoteId: q.id,
            productType: i.productType,
            productId: i.productId ?? null,
            name: i.name,
            serial: i.serial ?? null,
            price: String(i.price),
            quantity: i.quantity,
          }))
        )
        .returning();
      return { ...q, items };
    });
    return reply.code(201).send({ quote: created });
  });

  // PATCH /quotes/:id — edita dados e substitui os itens (não vale para orçamento já convertido)
  app.patch("/quotes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const parsed = quoteInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || "Dados inválidos" });
    }
    const d = parsed.data;
    try {
      const updated = await db.transaction(async (tx) => {
        const [q] = await tx.select().from(quotes).where(eq(quotes.id, id)).for("update").limit(1);
        if (!q) throw quoteError("Orçamento não encontrado", 404);
        if (q.status === "Convertido") throw quoteError("Orçamento já convertido em venda não pode ser editado.", 409);

        let customerName = d.customerName;
        let customerPhone = d.customerPhone;
        if (d.customerId) {
          const [c] = await tx.select().from(customers).where(eq(customers.id, d.customerId)).limit(1);
          if (!c) throw quoteError("Cliente não encontrado", 400);
          customerName = customerName || c.name;
          customerPhone = customerPhone || c.whatsapp || "";
        }
        if (!customerName) throw quoteError("Informe o cliente", 400);

        const { subtotal, total } = totalsOf(d.items, d.discount);
        const [row] = await tx
          .update(quotes)
          .set({
            customerId: d.customerId ?? null,
            customerName,
            customerPhone,
            sellerName: d.sellerName || q.sellerName,
            validUntil: d.validUntil ?? q.validUntil,
            subtotal: String(subtotal),
            discount: String(d.discount),
            total: String(total),
            paymentTerms: d.paymentTerms,
            notes: d.notes,
            updatedAt: new Date(),
          })
          .where(eq(quotes.id, id))
          .returning();
        await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));
        const items = await tx
          .insert(quoteItems)
          .values(
            d.items.map((i) => ({
              quoteId: id,
              productType: i.productType,
              productId: i.productId ?? null,
              name: i.name,
              serial: i.serial ?? null,
              price: String(i.price),
              quantity: i.quantity,
            }))
          )
          .returning();
        return { ...row, items };
      });
      return { quote: updated };
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code) return reply.code(code).send({ error: (err as Error).message });
      throw err;
    }
  });

  // POST /quotes/:id/status — Aberto / Enviado / Aprovado / Recusado ("Convertido" só pela venda)
  app.post("/quotes/:id/status", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({ status: editableStatus }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Status inválido" });
    const [q] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
    if (!q) return reply.code(404).send({ error: "Orçamento não encontrado" });
    if (q.status === "Convertido") {
      return reply.code(409).send({ error: "Orçamento já convertido em venda." });
    }
    const [row] = await db
      .update(quotes)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(quotes.id, id))
      .returning();
    const items = await loadWithItems([id]);
    return { quote: { ...row, items: items[id] ?? [] } };
  });

  // DELETE /quotes/:id — admin ou quem criou; convertido não pode ser excluído
  app.delete("/quotes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.user as JwtUser;
    const [q] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
    if (!q) return reply.code(404).send({ error: "Orçamento não encontrado" });
    if (q.status === "Convertido") {
      return reply.code(409).send({ error: "Orçamento já convertido em venda não pode ser excluído." });
    }
    // Quem criou pode excluir; os demais precisam da capacidade deleteRecords.
    // O cargo vem do banco (o hook requireCapability já o revalidou nesta requisição).
    const isOwner = q.sellerId === user.sub;
    if (!isOwner && !can(currentRole(req), "deleteRecords")) {
      return reply.code(403).send({ error: "Sem permissão para esta ação" });
    }
    await db.delete(quotes).where(eq(quotes.id, id));
    await logAudit(req, {
      action: "quote.delete",
      entity: "quote",
      entityId: id,
      description: `Excluiu o orçamento nº ${q.number} de ${q.customerName}`,
      details: { total: q.total, status: q.status },
    });
    return { ok: true };
  });
}
