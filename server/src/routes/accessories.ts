import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { accessories, stockMovements } from "../db/schema/index";
import { authenticate, requireRole, type JwtUser } from "../plugins/auth";

const accessoryInput = z.object({
  name: z.string().min(1),
  category: z.enum(["Capas", "Películas", "Cabos e Fontes"]),
  subcategory: z.string().optional().default(""),
  compatibleModel: z.string().optional().default(""),
  quantity: z.coerce.number().int().min(0).default(0),
  minQuantity: z.coerce.number().int().min(0).default(0),
  cost: z.coerce.number().min(0).default(0),
  price: z.coerce.number().min(0).optional(),
  barcode: z.string().optional().default(""),
});

export async function accessoryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /accessories
  app.get("/accessories", async () => {
    const rows = await db.select().from(accessories).orderBy(desc(accessories.createdAt));
    return { accessories: rows };
  });

  // POST /accessories
  app.post("/accessories", async (req, reply) => {
    const parsed = accessoryInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const a = parsed.data;
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(accessories)
        .values({
          ...a,
          cost: String(a.cost),
          price: a.price !== undefined ? String(a.price) : null,
        })
        .returning();
      if (created.quantity > 0) {
        await tx.insert(stockMovements).values({
          productType: "accessory",
          productId: created.id,
          movementType: "entrada",
          quantity: created.quantity,
          reason: "Cadastro",
          userId: (req.user as JwtUser).sub,
        });
      }
      return created;
    });
    return reply.code(201).send({ accessory: row });
  });

  // PATCH /accessories/:id  (quantidade e/ou outros campos)
  app.patch("/accessories/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const partial = accessoryInput.partial().safeParse(req.body);
    if (!partial.success) {
      return reply.code(400).send({ error: "Dados inválidos" });
    }
    const data = partial.data;
    const values: Record<string, unknown> = { ...data };
    if (data.cost !== undefined) values.cost = String(data.cost);
    if (data.price !== undefined) values.price = String(data.price);
    const [row] = await db
      .update(accessories)
      .set(values)
      .where(eq(accessories.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Acessório não encontrado" });
    return { accessory: row };
  });

  // DELETE /accessories/:id (somente admin)
  app.delete("/accessories/:id", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(accessories).where(eq(accessories.id, id));
    return { ok: true };
  });
}
