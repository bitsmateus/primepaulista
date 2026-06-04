import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { whatsappConfig } from "../db/schema/index";
import { authenticate, requireRole } from "../plugins/auth";
import { callUazapi } from "../services/whatsapp";

// Busca (ou cria) a linha única de configuração
async function getConfig() {
  const [row] = await db.select().from(whatsappConfig).limit(1);
  if (row) return row;
  const [created] = await db.insert(whatsappConfig).values({}).returning();
  return created;
}

export async function whatsappRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /whatsapp/config — NUNCA devolve a apiKey (apenas se está configurada)
  app.get("/whatsapp/config", async () => {
    const cfg = await getConfig();
    return {
      config: {
        apiKey: "", // mascarada: deixe em branco para manter a atual
        instanceUrl: cfg.instanceUrl,
        instanceName: cfg.instanceName,
        configured: Boolean(cfg.apiKey && cfg.instanceUrl),
      },
    };
  });

  // PUT /whatsapp/config — somente admin; apiKey vazia mantém a atual
  app.put("/whatsapp/config", { preHandler: requireRole("admin") }, async (req, reply) => {
    const p = z
      .object({
        apiKey: z.string().max(500).optional().default(""),
        instanceUrl: z.string().max(500).default(""),
        instanceName: z.string().max(200).default(""),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const cfg = await getConfig();
    const [row] = await db
      .update(whatsappConfig)
      .set({
        // só troca a apiKey se uma nova foi enviada
        apiKey: p.data.apiKey.trim() ? p.data.apiKey : cfg.apiKey,
        instanceUrl: p.data.instanceUrl,
        instanceName: p.data.instanceName,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConfig.id, cfg.id))
      .returning();
    return {
      config: {
        apiKey: "",
        instanceUrl: row.instanceUrl,
        instanceName: row.instanceName,
        configured: Boolean(row.apiKey && row.instanceUrl),
      },
    };
  });

  // Garante que há config antes de chamar a Uazapi
  async function requireConfig(reply: import("fastify").FastifyReply) {
    const cfg = await getConfig();
    if (!cfg.instanceUrl || !cfg.apiKey) {
      reply.code(400).send({ error: "WhatsApp não configurado. Salve a instância e a API Key." });
      return null;
    }
    return cfg;
  }

  // GET /whatsapp/status
  app.get("/whatsapp/status", async (_req, reply) => {
    const cfg = await requireConfig(reply);
    if (!cfg) return;
    try {
      const r = await callUazapi(cfg, "/instance/status", "GET");
      const status = r.data?.state || r.data?.status || "disconnected";
      return { status };
    } catch {
      return { status: "disconnected" };
    }
  });

  // GET /whatsapp/qrcode
  app.get("/whatsapp/qrcode", async (_req, reply) => {
    const cfg = await requireConfig(reply);
    if (!cfg) return;
    const r = await callUazapi(cfg, "/instance/qrcode", "GET");
    if (!r.ok) return reply.code(502).send({ error: "Falha ao gerar QR Code" });
    return { qrcode: r.data?.qrcode || r.data?.base64 || r.data?.code || null };
  });

  // POST /whatsapp/disconnect
  app.post("/whatsapp/disconnect", async (_req, reply) => {
    const cfg = await requireConfig(reply);
    if (!cfg) return;
    await callUazapi(cfg, "/instance/logout", "POST");
    return { ok: true };
  });

  // POST /whatsapp/restart
  app.post("/whatsapp/restart", async (_req, reply) => {
    const cfg = await requireConfig(reply);
    if (!cfg) return;
    await callUazapi(cfg, "/instance/restart", "POST");
    return { ok: true };
  });

  // POST /whatsapp/send  { phone, message }
  app.post("/whatsapp/send", async (req, reply) => {
    const p = z.object({ phone: z.string().min(1), message: z.string().min(1) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Telefone e mensagem são obrigatórios" });
    const cfg = await requireConfig(reply);
    if (!cfg) return;
    const cleanPhone = p.data.phone.replace(/\D/g, "");
    try {
      const r = await callUazapi(cfg, "/message/text", "POST", {
        number: cleanPhone,
        text: p.data.message,
      });
      return { success: r.ok };
    } catch {
      return { success: false };
    }
  });
}
