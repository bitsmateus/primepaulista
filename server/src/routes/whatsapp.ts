import type { FastifyInstance, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { whatsappInstances } from "../db/schema/index";
import { authenticate } from "../plugins/auth";
import { callUazapi, getInstance, getInstances } from "../services/whatsapp";

type JwtUser = { sub: string; name: string; role: string };

// Formato público da instância (NUNCA devolve a apiKey)
function publicInstance(i: typeof whatsappInstances.$inferSelect, userId: string) {
  return {
    id: i.id,
    name: i.name,
    instanceUrl: i.instanceUrl,
    instanceName: i.instanceName,
    ownerId: i.ownerId,
    ownerName: i.ownerName ?? "",
    active: i.active,
    configured: Boolean(i.apiKey && i.instanceUrl),
    mine: i.ownerId === userId,
  };
}

export async function whatsappRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /whatsapp/instances — todas (cada um vê as suas e também as dos outros)
  app.get("/whatsapp/instances", async (req) => {
    const user = req.user as JwtUser;
    const rows = await getInstances();
    return { instances: rows.map((i) => publicInstance(i, user.sub)) };
  });

  // POST /whatsapp/instances — cria uma instância (dono = usuário logado)
  app.post("/whatsapp/instances", async (req, reply) => {
    const p = z
      .object({
        name: z.string().min(1).max(120),
        apiKey: z.string().max(500),
        instanceUrl: z.string().max(500),
        instanceName: z.string().max(200).optional().default(""),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const user = req.user as JwtUser;
    const [row] = await db
      .insert(whatsappInstances)
      .values({ ...p.data, ownerId: user.sub, ownerName: user.name })
      .returning();
    return reply.code(201).send({ instance: publicInstance(row, user.sub) });
  });

  // PUT /whatsapp/instances/:id — atualiza (apiKey vazia mantém a atual)
  app.put("/whatsapp/instances/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({
        name: z.string().min(1).max(120).optional(),
        apiKey: z.string().max(500).optional().default(""),
        instanceUrl: z.string().max(500).optional(),
        instanceName: z.string().max(200).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const cur = await getInstance(id);
    if (!cur) return reply.code(404).send({ error: "Instância não encontrada" });
    const user = req.user as JwtUser;
    const [row] = await db
      .update(whatsappInstances)
      .set({
        name: p.data.name ?? cur.name,
        apiKey: p.data.apiKey?.trim() ? p.data.apiKey : cur.apiKey,
        instanceUrl: p.data.instanceUrl ?? cur.instanceUrl,
        instanceName: p.data.instanceName ?? cur.instanceName,
        active: p.data.active ?? cur.active,
      })
      .where(eq(whatsappInstances.id, id))
      .returning();
    return { instance: publicInstance(row, user.sub) };
  });

  // DELETE /whatsapp/instances/:id
  app.delete("/whatsapp/instances/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.delete(whatsappInstances).where(eq(whatsappInstances.id, id));
    return reply.send({ ok: true });
  });

  // Garante instância configurada antes de chamar a Uazapi
  async function requireInstance(id: string, reply: FastifyReply) {
    const inst = await getInstance(id);
    if (!inst || !inst.instanceUrl || !inst.apiKey) {
      reply.code(400).send({ error: "Instância não configurada (URL e API Key)." });
      return null;
    }
    return inst;
  }

  app.get("/whatsapp/instances/:id/status", async (req, reply) => {
    const { id } = req.params as { id: string };
    const inst = await requireInstance(id, reply);
    if (!inst) return;
    try {
      const r = await callUazapi(inst, "/instance/status", "GET");
      return { status: r.data?.state || r.data?.status || "disconnected" };
    } catch {
      return { status: "disconnected" };
    }
  });

  app.get("/whatsapp/instances/:id/qrcode", async (req, reply) => {
    const { id } = req.params as { id: string };
    const inst = await requireInstance(id, reply);
    if (!inst) return;
    const r = await callUazapi(inst, "/instance/qrcode", "GET");
    if (!r.ok) return reply.code(502).send({ error: "Falha ao gerar QR Code" });
    return { qrcode: r.data?.qrcode || r.data?.base64 || r.data?.code || null };
  });

  app.post("/whatsapp/instances/:id/disconnect", async (req, reply) => {
    const { id } = req.params as { id: string };
    const inst = await requireInstance(id, reply);
    if (!inst) return;
    await callUazapi(inst, "/instance/logout", "POST");
    return { ok: true };
  });

  app.post("/whatsapp/instances/:id/restart", async (req, reply) => {
    const { id } = req.params as { id: string };
    const inst = await requireInstance(id, reply);
    if (!inst) return;
    await callUazapi(inst, "/instance/restart", "POST");
    return { ok: true };
  });

  // POST /whatsapp/instances/:id/send  { phone, message }
  app.post("/whatsapp/instances/:id/send", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ phone: z.string().min(1), message: z.string().min(1) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Telefone e mensagem são obrigatórios" });
    const inst = await requireInstance(id, reply);
    if (!inst) return;
    try {
      const r = await callUazapi(inst, "/message/text", "POST", {
        number: p.data.phone.replace(/\D/g, ""),
        text: p.data.message,
      });
      return { success: r.ok };
    } catch {
      return { success: false };
    }
  });
}
