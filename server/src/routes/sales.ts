import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import {
  sales,
  saleItems,
  payments,
  tradeIns,
  saleReturns,
  devices,
  accessories,
  stockMovements,
  customers,
  quotes,
  paymentMethodEnum,
} from "../db/schema/index";
import { authenticate, currentRole, requireCapability, type JwtUser } from "../plugins/auth";
import { can } from "../lib/permissions";
import { brl, logAudit } from "../services/audit";
import { STAGE, advanceLeadStage } from "../services/leadFunnel";

// Métodos de pagamento aceitos = valores do enum do banco (uma única fonte)
const paymentMethod = z.enum(paymentMethodEnum.enumValues);

const saleInput = z.object({
  customerId: z.string().uuid(),
  quoteId: z.string().uuid().optional(), // venda gerada a partir de um orçamento
  sellerName: z.string().optional().default(""),
  subtotal: z.coerce.number().min(0),
  tradeInDiscount: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0),
  giftsCost: z.coerce.number().min(0).default(0),
  requiresInvoice: z.coerce.boolean().default(false),
  notes: z.string().max(2000).optional().default(""),
  items: z
    .array(
      z.object({
        productType: z.enum(["device", "accessory"]),
        productId: z.string().uuid(),
        name: z.string(),
        serial: z.string().optional(),
        price: z.coerce.number().min(0),
        quantity: z.coerce.number().int().min(1),
        warrantyDays: z.coerce.number().int().min(0).optional().default(0),
      })
    )
    .min(1),
  payments: z
    .array(
      z.object({
        method: paymentMethod,
        amount: z.coerce.number().min(0),
        installments: z.coerce.number().int().min(1).optional(),
      })
    )
    .min(1),
  tradeIn: z
    .object({
      imei: z.string().max(60).optional().default(""),
      model: z.string().max(100),
      healthDescription: z.string().max(300).optional().default(""),
      value: z.coerce.number().min(0),
      category: z.string().max(50).optional().default("iPhone"),
      capacity: z.string().max(50).optional().default(""),
      color: z.string().max(60).optional().default(""),
      condition: z.enum(["Lacrado", "Seminovo"]).optional().default("Seminovo"),
      batteryHealth: z.coerce.number().int().min(0).max(100).optional().default(100),
    })
    .optional(),
});

export async function saleRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /sales — lista vendas (resumo)
  app.get("/sales", { preHandler: requireCapability("viewSalesData") }, async () => {
    const rows = await db.select().from(sales).orderBy(desc(sales.createdAt));
    return { sales: rows };
  });

  // GET /sales/full — vendas com itens, pagamentos, troca e cliente aninhados (para BI)
  app.get("/sales/full", { preHandler: requireCapability("viewSalesData") }, async (req) => {
    const seesAuditNote = can(currentRole(req), "reconcile");
    const saleRows = await db.select().from(sales).orderBy(desc(sales.createdAt));
    if (saleRows.length === 0) return { sales: [] };

    const ids = saleRows.map((s) => s.id);
    const custIds = [...new Set(saleRows.map((s) => s.customerId).filter(Boolean))] as string[];

    const [items, pays, trades, custs] = await Promise.all([
      db.select().from(saleItems).where(inArray(saleItems.saleId, ids)),
      db.select().from(payments).where(inArray(payments.saleId, ids)),
      db.select().from(tradeIns).where(inArray(tradeIns.saleId, ids)),
      custIds.length
        ? db.select().from(customers).where(inArray(customers.id, custIds))
        : Promise.resolve([]),
    ]);

    const byId = <T extends { saleId: string }>(arr: T[]) => {
      const map: Record<string, T[]> = {};
      for (const r of arr) (map[r.saleId] ??= []).push(r);
      return map;
    };
    const itemsBySale = byId(items);
    const paysBySale = byId(pays);
    const tradeBySale = byId(trades);
    const custById = Object.fromEntries(custs.map((c) => [c.id, c]));

    const result = saleRows.map((s) => ({
      ...s,
      customer: s.customerId ? custById[s.customerId] ?? null : null,
      items: itemsBySale[s.id] ?? [],
      // observação/quem conferiu só para quem faz a conferência (o status todos veem)
      payments: (paysBySale[s.id] ?? []).map((p) =>
        seesAuditNote ? p : { ...p, auditNote: "", auditedBy: null, auditedByName: "" }
      ),
      tradeIn: tradeBySale[s.id]?.[0] ?? null,
    }));

    return { sales: result };
  });

  // POST /sales — finaliza a venda de forma transacional
  app.post("/sales", { preHandler: requireCapability("sell") }, async (req, reply) => {
    const parsed = saleInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const s = parsed.data;
    const sellerId = (req.user as JwtUser).sub;

    // Recalcula os totais no servidor (não confia nos valores do cliente)
    const subtotal = s.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const total = Math.max(0, subtotal - s.tradeInDiscount - s.discount);

    try {
      const saleId = await db.transaction(async (tx) => {
        // 0) Trava e valida disponibilidade/estoque (evita venda dupla / estoque negativo)
        for (const it of s.items) {
          if (it.productType === "device") {
            const [dev] = await tx
              .select({ status: devices.status })
              .from(devices)
              .where(eq(devices.id, it.productId))
              .for("update")
              .limit(1);
            if (!dev) throw saleError(`Aparelho não encontrado: ${it.name}`);
            if (dev.status === "Vendido")
              throw saleError(`O aparelho "${it.name}" já foi vendido.`);
          } else {
            const [acc] = await tx
              .select({ quantity: accessories.quantity })
              .from(accessories)
              .where(eq(accessories.id, it.productId))
              .for("update")
              .limit(1);
            if (!acc) throw saleError(`Acessório não encontrado: ${it.name}`);
            if (acc.quantity < it.quantity)
              throw saleError(
                `Estoque insuficiente de "${it.name}" (disponível: ${acc.quantity}).`
              );
          }
        }

        // 0b) Orçamento de origem: trava e confere que ainda não virou venda
        if (s.quoteId) {
          const [q] = await tx
            .select({ status: quotes.status, number: quotes.number })
            .from(quotes)
            .where(eq(quotes.id, s.quoteId))
            .for("update")
            .limit(1);
          if (!q) throw saleError("Orçamento de origem não encontrado.");
          if (q.status === "Convertido")
            throw saleError(`O orçamento nº ${q.number} já foi convertido em venda.`);
        }

        // 1) Cabeçalho da venda
        const [sale] = await tx
          .insert(sales)
          .values({
            customerId: s.customerId,
            sellerId,
            sellerName: s.sellerName,
            subtotal: String(subtotal),
            tradeInDiscount: String(s.tradeInDiscount),
            discount: String(s.discount),
            total: String(total),
            giftsCost: String(s.giftsCost),
            requiresInvoice: s.requiresInvoice,
            notes: s.notes,
            origin: s.quoteId ? "Orçamento" : "Balcão",
            quoteId: s.quoteId ?? null,
          })
          .returning({ id: sales.id });

        if (s.quoteId) {
          await tx
            .update(quotes)
            .set({ status: "Convertido", convertedSaleId: sale.id, updatedAt: new Date() })
            .where(eq(quotes.id, s.quoteId));
        }

        // 2) Itens
        await tx.insert(saleItems).values(
          s.items.map((it) => ({
            saleId: sale.id,
            productType: it.productType,
            productId: it.productId,
            name: it.name,
            serial: it.serial ?? null,
            price: String(it.price),
            quantity: it.quantity,
            warrantyDays: it.warrantyDays ?? 0,
          }))
        );

        // 3) Pagamentos
        await tx.insert(payments).values(
          s.payments.map((p) => ({
            saleId: sale.id,
            method: p.method,
            amount: String(p.amount),
            installments: p.installments ?? 1,
          }))
        );

        // 4) Aparelho de troca (opcional) — registra a troca e entra no estoque
        if (s.tradeIn) {
          await tx.insert(tradeIns).values({
            saleId: sale.id,
            imei: s.tradeIn.imei,
            model: s.tradeIn.model,
            healthDescription: s.tradeIn.healthDescription,
            value: String(s.tradeIn.value),
          });
          // Cria o aparelho de troca como novo dispositivo disponível
          const [tradeDevice] = await tx
            .insert(devices)
            .values({
              category: s.tradeIn.category,
              model: s.tradeIn.model,
              capacity: s.tradeIn.capacity,
              color: s.tradeIn.color,
              condition: s.tradeIn.condition,
              batteryHealth: s.tradeIn.batteryHealth,
              cost: String(s.tradeIn.value),
              serialImei: s.tradeIn.imei,
              supplier: "Troca (PDV)",
              status: "Disponível",
            })
            .returning({ id: devices.id });
          await tx.insert(stockMovements).values({
            productType: "device",
            productId: tradeDevice.id,
            movementType: "entrada",
            quantity: 1,
            reason: "Aparelho de troca",
            userId: sellerId,
          });
        }

        // 5) Baixa de estoque + histórico de movimentação
        for (const it of s.items) {
          if (it.productType === "device") {
            await tx
              .update(devices)
              .set({ status: "Vendido" })
              .where(eq(devices.id, it.productId));
          } else {
            const [acc] = await tx
              .select({ quantity: accessories.quantity })
              .from(accessories)
              .where(eq(accessories.id, it.productId))
              .limit(1);
            if (acc) {
              await tx
                .update(accessories)
                .set({ quantity: Math.max(0, acc.quantity - it.quantity) })
                .where(eq(accessories.id, it.productId));
            }
          }
          await tx.insert(stockMovements).values({
            productType: it.productType,
            productId: it.productId,
            movementType: "saida",
            quantity: it.quantity,
            reason: "Venda",
            userId: sellerId,
          });
        }

        return sale.id;
      });

      const [cust] = await db.select({ name: customers.name, whatsapp: customers.whatsapp }).from(customers).where(eq(customers.id, s.customerId)).limit(1);
      // CRM: se o cliente é um lead (mesmo telefone), ele vai para "Venda Concluída" (só se a etapa existir)
      await advanceLeadStage(cust?.whatsapp, STAGE.saleDone);
      await logAudit(req, {
        action: "sale.create",
        entity: "sale",
        entityId: saleId,
        description: `Registrou a venda de ${brl(total)} para ${cust?.name ?? "cliente"}`,
        details: { total, discount: s.discount, items: s.items.length, seller: s.sellerName || null },
      });
      return reply.code(201).send({ saleId });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 409) {
        return reply.code(409).send({ error: (err as Error).message });
      }
      app.log.error(err);
      return reply.code(500).send({ error: "Falha ao registrar a venda" });
    }
  });

  // PATCH /sales/:id — edita dados da venda (sem mexer no estoque). Somente admin.
  app.patch("/sales/:id", { preHandler: requireCapability("editSales") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({
        customerId: z.string().uuid().optional(),
        sellerName: z.string().max(120).optional(),
        discount: z.coerce.number().min(0).optional(),
        giftsCost: z.coerce.number().min(0).optional(),
        requiresInvoice: z.coerce.boolean().optional(),
        notes: z.string().max(2000).optional(),
        paymentMethod: paymentMethod.optional(),
        installments: z.coerce.number().int().min(1).optional(),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });

    try {
      let audit: { desc: string; details: Record<string, unknown> } | null = null;
      await db.transaction(async (tx) => {
        const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for("update").limit(1);
        if (!sale) throw saleError("Venda não encontrada.", 404);
        if (sale.returnedAt) throw saleError("Venda devolvida não pode ser editada.");
        const [cust] = await tx.select({ name: customers.name }).from(customers).where(eq(customers.id, sale.customerId ?? id)).limit(1);
        const changes: Record<string, unknown> = {};
        if (p.data.customerId !== undefined && p.data.customerId !== sale.customerId) changes.cliente = { de: sale.customerId, para: p.data.customerId };
        if (p.data.sellerName !== undefined && p.data.sellerName !== sale.sellerName) changes.vendedor = { de: sale.sellerName, para: p.data.sellerName };
        if (p.data.discount !== undefined && p.data.discount !== Number(sale.discount)) changes.desconto = { de: Number(sale.discount), para: p.data.discount };
        if (p.data.giftsCost !== undefined && p.data.giftsCost !== Number(sale.giftsCost)) changes.custoBrindes = { de: Number(sale.giftsCost), para: p.data.giftsCost };
        if (p.data.requiresInvoice !== undefined && p.data.requiresInvoice !== sale.requiresInvoice) changes.nota = { de: sale.requiresInvoice, para: p.data.requiresInvoice };
        if (p.data.notes !== undefined && p.data.notes !== (sale.notes ?? "")) changes.observacao = true;
        if (p.data.paymentMethod) changes.formaPagamento = p.data.paymentMethod;
        audit = { desc: `Editou a venda de ${brl(sale.total)} de ${cust?.name ?? "cliente"} (${Object.keys(changes).join(", ") || "sem mudanças"})`, details: changes };

        const update: Record<string, unknown> = {};
        if (p.data.customerId !== undefined) update.customerId = p.data.customerId;
        if (p.data.sellerName !== undefined) update.sellerName = p.data.sellerName;
        if (p.data.notes !== undefined) update.notes = p.data.notes;
        if (p.data.giftsCost !== undefined) update.giftsCost = String(p.data.giftsCost);
        if (p.data.requiresInvoice !== undefined) update.requiresInvoice = p.data.requiresInvoice;

        let total = Number(sale.total);
        if (p.data.discount !== undefined) {
          total = Math.max(0, Number(sale.subtotal) - Number(sale.tradeInDiscount) - p.data.discount);
          update.discount = String(p.data.discount);
          update.total = String(total);
        }
        if (Object.keys(update).length) {
          await tx.update(sales).set(update).where(eq(sales.id, id));
        }

        // Forma de pagamento: substitui os pagamentos por um único do total.
        // Se já era exatamente esse pagamento, mantém (preserva a conferência financeira);
        // se mudou, o novo pagamento volta a "Aguardando" conferência.
        if (p.data.paymentMethod) {
          const existing = await tx.select().from(payments).where(eq(payments.saleId, id));
          const newInst = p.data.installments ?? 1;
          const same =
            existing.length === 1 &&
            existing[0].method === p.data.paymentMethod &&
            Number(existing[0].amount) === total &&
            (existing[0].installments ?? 1) === newInst;
          if (!same) {
            await tx.delete(payments).where(eq(payments.saleId, id));
            await tx.insert(payments).values({
              saleId: id,
              method: p.data.paymentMethod,
              amount: String(total),
              installments: newInst,
            });
          }
        }
      });
      if (audit) {
        const a = audit as { desc: string; details: Record<string, unknown> };
        await logAudit(req, { action: "sale.update", entity: "sale", entityId: id, description: a.desc, details: a.details });
      }
      return { ok: true };
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404) return reply.code(404).send({ error: (err as Error).message });
      if (code === 409) return reply.code(409).send({ error: (err as Error).message });
      app.log.error(err);
      return reply.code(500).send({ error: "Falha ao editar a venda" });
    }
  });

  // POST /sales/:id/return — devolução/estorno total (somente admin)
  app.post("/sales/:id/return", { preHandler: requireCapability("returnSales") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ reason: z.string().max(500).optional().default("") }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const userId = (req.user as JwtUser).sub;

    try {
      let retAudit: { total: string; customer: string } | null = null;
      await db.transaction(async (tx) => {
        const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for("update").limit(1);
        if (!sale) throw saleError("Venda não encontrada.", 404);
        if (sale.returnedAt) throw saleError("Esta venda já foi devolvida.");
        const [cust] = await tx.select({ name: customers.name }).from(customers).where(eq(customers.id, sale.customerId ?? id)).limit(1);
        retAudit = { total: sale.total, customer: cust?.name ?? "cliente" };

        const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id));
        // Restitui o estoque de cada item
        for (const it of items) {
          if (!it.productId) continue;
          if (it.productType === "device") {
            // Só reabilita se ainda estiver "Vendido" (evita reabrir aparelho já
            // revendido/em manutenção e causar venda dupla do mesmo IMEI)
            await tx
              .update(devices)
              .set({ status: "Disponível" })
              .where(and(eq(devices.id, it.productId), eq(devices.status, "Vendido")));
          } else {
            const [acc] = await tx
              .select({ quantity: accessories.quantity })
              .from(accessories)
              .where(eq(accessories.id, it.productId))
              .limit(1);
            if (acc) {
              await tx
                .update(accessories)
                .set({ quantity: acc.quantity + it.quantity })
                .where(eq(accessories.id, it.productId));
            }
          }
          await tx.insert(stockMovements).values({
            productType: it.productType,
            productId: it.productId,
            movementType: "entrada",
            quantity: it.quantity,
            reason: "Devolução",
            userId,
          });
        }

        await tx.insert(saleReturns).values({
          saleId: id,
          reason: p.data.reason,
          refundAmount: sale.total,
          userId,
        });
        await tx.update(sales).set({ returnedAt: new Date() }).where(eq(sales.id, id));
      });
      if (retAudit) {
        const r = retAudit as { total: string; customer: string };
        await logAudit(req, {
          action: "sale.return",
          entity: "sale",
          entityId: id,
          description: `Devolveu a venda de ${brl(r.total)} para ${r.customer}`,
          details: { total: r.total, reason: p.data.reason || null },
        });
      }
      return { ok: true };
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404) return reply.code(404).send({ error: (err as Error).message });
      if (code === 409) return reply.code(409).send({ error: (err as Error).message });
      app.log.error(err);
      return reply.code(500).send({ error: "Falha ao processar a devolução" });
    }
  });
}

// Erro de validação de venda (estoque/disponibilidade) → 409 por padrão
function saleError(message: string, statusCode = 409) {
  return Object.assign(new Error(message), { statusCode });
}
