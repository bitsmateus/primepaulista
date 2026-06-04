import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { automations } from "../db/schema/index";
import { authenticate, requireRole } from "../plugins/auth";
import { getAutomations, runAutomations } from "../services/automations";

export async function automationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /automations
  app.get("/automations", async () => {
    const rows = await getAutomations();
    return { automations: rows };
  });

  // PUT /automations/:key  (admin)
  app.put(
    "/automations/:key",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const { key } = req.params as { key: string };
      const p = z
        .object({
          enabled: z.boolean().optional(),
          daysAfter: z.coerce.number().int().min(0).optional(),
          message: z.string().optional(),
        })
        .safeParse(req.body);
      if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
      await getAutomations(); // garante seed
      const [row] = await db
        .update(automations)
        .set({ ...p.data, updatedAt: new Date() })
        .where(eq(automations.key, key))
        .returning();
      if (!row) return reply.code(404).send({ error: "Automação não encontrada" });
      return { automation: row };
    }
  );

  // POST /automations/run  (admin) — dispara as automações manualmente
  app.post(
    "/automations/run",
    { preHandler: requireRole("admin") },
    async () => {
      const summary = await runAutomations();
      return { summary };
    }
  );
}
