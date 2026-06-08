import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { customers } from "../db/schema/index";
import { authenticate, requireRole } from "../plugins/auth";

const customerInput = z.object({
  name: z.string().min(1).max(200),
  cpf: z.string().max(20).optional().default(""),
  whatsapp: z.string().max(30).optional().default(""),
  birthday: z.string().max(20).optional().default(""),
  leadOrigin: z.enum(["Instagram", "Indicação", "Tráfego Pago"]).optional(),
});

export async function customerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /customers
  app.get("/customers", async () => {
    const rows = await db.select().from(customers).orderBy(desc(customers.createdAt));
    return { customers: rows };
  });

  // POST /customers
  app.post("/customers", async (req, reply) => {
    const parsed = customerInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const [row] = await db.insert(customers).values(parsed.data).returning();
    return reply.code(201).send({ customer: row });
  });

  // PATCH /customers/:id — editar cliente
  app.patch("/customers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = customerInput.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos" });
    }
    const [row] = await db
      .update(customers)
      .set(parsed.data)
      .where(eq(customers.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Cliente não encontrado" });
    return { customer: row };
  });

  // DELETE /customers/:id (somente admin)
  app.delete("/customers/:id", { preHandler: requireRole("admin") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await db.delete(customers).where(eq(customers.id, id));
      return { ok: true };
    } catch (err) {
      // 23503 = violação de chave estrangeira (cliente possui vendas)
      if ((err as { code?: string }).code === "23503") {
        return reply
          .code(409)
          .send({ error: "Este cliente possui vendas e não pode ser excluído." });
      }
      throw err;
    }
  });
}
