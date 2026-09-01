import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { devices, stockMovements } from "../db/schema/index";
import { authenticate, requireRole, type JwtUser } from "../plugins/auth";

const deviceInput = z.object({
  category: z.string().max(50).optional().default("iPhone"),
  model: z.string().min(1).max(100),
  capacity: z.string().max(50).optional().default(""),
  color: z.string().max(60).optional().default(""),
  condition: z.enum(["Lacrado", "Seminovo"]),
  batteryHealth: z.coerce.number().int().min(0).max(100).default(100),
  supplier: z.string().optional().default(""),
  cost: z.coerce.number().min(0).default(0),
  salePrice: z.coerce.number().min(0).optional(),
  serialImei: z.string().optional().default(""), // IMEI 1
  imei2: z.string().optional().default(""), // IMEI 2
  serial: z.string().optional().default(""), // número de série
  internalSerial: z.string().optional().default(""),
  entryDate: z.coerce.date().optional(),
  notes: z.string().optional().default(""),
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
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(devices)
        .values({
          ...d,
          cost: String(d.cost),
          salePrice: d.salePrice !== undefined ? String(d.salePrice) : null,
        })
        .returning();
      await tx.insert(stockMovements).values({
        productType: "device",
        productId: created.id,
        movementType: "entrada",
        quantity: 1,
        reason: "Cadastro",
        userId: (req.user as JwtUser).sub,
      });
      return created;
    });
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
    if (data.salePrice !== undefined) values.salePrice = String(data.salePrice);
    const [row] = await db
      .update(devices)
      .set(values)
      .where(eq(devices.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Aparelho não encontrado" });
    return { device: row };
  });

  // DELETE /devices/:id (somente admin)
  app.delete("/devices/:id", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    await db.delete(devices).where(eq(devices.id, id));
    return { ok: true };
  });
}
