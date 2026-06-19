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
} from "../db/schema/index";
import { authenticate, requireRole, type JwtUser } from "../plugins/auth";

const saleInput = z.object({
  customerId: z.string().uuid(),
  sellerName: z.string().optional().default(""),
  subtotal: z.coerce.number().min(0),
  tradeInDiscount: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0),
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
        method: z.enum(["PIX", "Dinheiro", "Cartão de Crédito", "Cartão de Débito"]),
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
  app.get("/sales", async () => {
    const rows = await db.select().from(sales).orderBy(desc(sales.createdAt));
    return { sales: rows };
  });

  // GET /sales/full — vendas com itens, pagamentos, troca e cliente aninhados (para BI)
  app.get("/sales/full", async () => {
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
      payments: paysBySale[s.id] ?? [],
      tradeIn: tradeBySale[s.id]?.[0] ?? null,
    }));

    return { sales: result };
  });

  // POST /sales — finaliza a venda de forma transacional
  app.post("/sales", async (req, reply) => {
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
            notes: s.notes,
          })
          .returning({ id: sales.id });

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
  app.patch("/sales/:id", { preHandler: requireRole("admin") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({
        customerId: z.string().uuid().optional(),
        sellerName: z.string().max(120).optional(),
        discount: z.coerce.number().min(0).optional(),
        notes: z.string().max(2000).optional(),
        paymentMethod: z
          .enum(["PIX", "Dinheiro", "Cartão de Crédito", "Cartão de Débito"])
          .optional(),
        installments: z.coerce.number().int().min(1).optional(),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });

    try {
      await db.transaction(async (tx) => {
        const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for("update").limit(1);
        if (!sale) throw saleError("Venda não encontrada.", 404);
        if (sale.returnedAt) throw saleError("Venda devolvida não pode ser editada.");

        const update: Record<string, unknown> = {};
        if (p.data.customerId !== undefined) update.customerId = p.data.customerId;
        if (p.data.sellerName !== undefined) update.sellerName = p.data.sellerName;
        if (p.data.notes !== undefined) update.notes = p.data.notes;

        let total = Number(sale.total);
        if (p.data.discount !== undefined) {
          total = Math.max(0, Number(sale.subtotal) - Number(sale.tradeInDiscount) - p.data.discount);
          update.discount = String(p.data.discount);
          update.total = String(total);
        }
        if (Object.keys(update).length) {
          await tx.update(sales).set(update).where(eq(sales.id, id));
        }

        // Forma de pagamento: substitui os pagamentos por um único do total
        if (p.data.paymentMethod) {
          await tx.delete(payments).where(eq(payments.saleId, id));
          await tx.insert(payments).values({
            saleId: id,
            method: p.data.paymentMethod,
            amount: String(total),
            installments: p.data.installments ?? 1,
          });
        }
      });
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
  app.post("/sales/:id/return", { preHandler: requireRole("admin") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ reason: z.string().max(500).optional().default("") }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const userId = (req.user as JwtUser).sub;

    try {
      await db.transaction(async (tx) => {
        const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for("update").limit(1);
        if (!sale) throw saleError("Venda não encontrada.", 404);
        if (sale.returnedAt) throw saleError("Esta venda já foi devolvida.");

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
