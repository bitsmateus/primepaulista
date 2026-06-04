import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import {
  sales,
  saleItems,
  payments,
  tradeIns,
  devices,
  accessories,
  stockMovements,
} from "../db/schema/index";
import { authenticate, type JwtUser } from "../plugins/auth";

const saleInput = z.object({
  customerId: z.string().uuid(),
  sellerName: z.string().optional().default(""),
  subtotal: z.coerce.number().min(0),
  tradeInDiscount: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0),
  items: z
    .array(
      z.object({
        productType: z.enum(["device", "accessory"]),
        productId: z.string().uuid(),
        name: z.string(),
        serial: z.string().optional(),
        price: z.coerce.number().min(0),
        quantity: z.coerce.number().int().min(1),
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
      imei: z.string().optional().default(""),
      model: z.string(),
      healthDescription: z.string().optional().default(""),
      value: z.coerce.number().min(0),
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

    try {
      const saleId = await db.transaction(async (tx) => {
        // 1) Cabeçalho da venda
        const [sale] = await tx
          .insert(sales)
          .values({
            customerId: s.customerId,
            sellerId,
            sellerName: s.sellerName,
            subtotal: String(s.subtotal),
            tradeInDiscount: String(s.tradeInDiscount),
            total: String(s.total),
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

        // 4) Aparelho de troca (opcional)
        if (s.tradeIn) {
          await tx.insert(tradeIns).values({
            saleId: sale.id,
            imei: s.tradeIn.imei,
            model: s.tradeIn.model,
            healthDescription: s.tradeIn.healthDescription,
            value: String(s.tradeIn.value),
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
      app.log.error(err);
      return reply.code(500).send({ error: "Falha ao registrar a venda" });
    }
  });
}
