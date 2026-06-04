import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { devices } from "../db/schema/index";
import { authenticate } from "../plugins/auth";

const deviceInput = z.object({
  model: z.string().min(1),
  capacity: z.string().min(1),
  color: z.string().min(1),
  condition: z.enum(["Lacrado", "Seminovo"]),
  batteryHealth: z.coerce.number().int().min(0).max(100).default(100),
  supplier: z.string().optional().default(""),
  cost: z.coerce.number().min(0).default(0),
  serialImei: z.string().optional().default(""),
  internalSerial: z.string().optional().default(""),
  status: z
    .enum(["Disponível", "Vendido", "Em Manutenção", "Reservado"])
    .default("Disponível"),
});

export async function deviceRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /devices
  app.get("/devices", async () => {
    const rows = await db.select().from(devices).orderBy(desc(devices.createdAt));
    return { devices: rows };
  });

  // POST /devices
  app.post("/devices", async (req, reply) => {
    const parsed = deviceInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    }
    const d = parsed.data;
    const [row] = await db
      .insert(devices)
      .values({ ...d, cost: String(d.cost) })
      .returning();
    return reply.code(201).send({ device: row });
  });

  // PATCH /devices/:id  (status e/ou outros campos)
  app.patch("/devices/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const partial = deviceInput.partial().safeParse(req.body);
    if (!partial.success) {
      return reply.code(400).send({ error: "Dados inválidos" });
    }
    const data = partial.data;
    const values: Record<string, unknown> = { ...data };
    if (data.cost !== undefined) values.cost = String(data.cost);
    const [row] = await db
      .update(devices)
      .set(values)
      .where(eq(devices.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Aparelho não encontrado" });
    return { device: row };
  });

  // DELETE /devices/:id
  app.delete("/devices/:id", async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(devices).where(eq(devices.id, id));
    return { ok: true };
  });
}
