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
  notes: z.string().max(2000).optional().default(""),
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

  // POST /customers/import — importação em lote com deduplicação por CPF/WhatsApp
  app.post("/customers/import", async (req, reply) => {
    const parsed = z.object({ customers: z.array(customerInput).max(5000) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos" });
    }
    const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

    const result = await db.transaction(async (tx) => {
      const existing = await tx.select({ cpf: customers.cpf, whatsapp: customers.whatsapp }).from(customers);
      const cpfs = new Set(existing.map((c) => onlyDigits(c.cpf ?? "")).filter(Boolean));
      const phones = new Set(existing.map((c) => onlyDigits(c.whatsapp ?? "")).filter(Boolean));

      const toCreate: typeof parsed.data.customers = [];
      let ignored = 0;
      for (const c of parsed.data.customers) {
        const cpf = onlyDigits(c.cpf);
        const phone = onlyDigits(c.whatsapp);
        if ((cpf && cpfs.has(cpf)) || (phone && phones.has(phone))) {
          ignored++;
          continue;
        }
        if (cpf) cpfs.add(cpf);
        if (phone) phones.add(phone);
        toCreate.push(c);
      }
      if (toCreate.length) await tx.insert(customers).values(toCreate);
      return { created: toCreate.length, ignored };
    });

    return reply.code(201).send(result);
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
