import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { whatsappConfig } from "../db/schema/index";
import { authenticate } from "../plugins/auth";

// Busca (ou cria) a linha única de configuração
async function getConfig() {
  const [row] = await db.select().from(whatsappConfig).limit(1);
  if (row) return row;
  const [created] = await db.insert(whatsappConfig).values({}).returning();
  return created;
}

function baseUrl(url: string) {
  return url.replace(/\/$/, "");
}

// Chama a API da Uazapi usando a config salva
async function uazapi(
  path: string,
  method: "GET" | "POST",
  cfg: { apiKey: string; instanceUrl: string },
  body?: unknown
) {
  const res = await fetch(`${baseUrl(cfg.instanceUrl)}${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function whatsappRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /whatsapp/config
  app.get("/whatsapp/config", async () => {
    const cfg = await getConfig();
    return {
      config: {
        apiKey: cfg.apiKey,
        instanceUrl: cfg.instanceUrl,
        instanceName: cfg.instanceName,
      },
    };
  });

  // PUT /whatsapp/config
  app.put("/whatsapp/config", async (req, reply) => {
    const p = z
      .object({
        apiKey: z.string().default(""),
        instanceUrl: z.string().default(""),
        instanceName: z.string().default(""),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const cfg = await getConfig();
    const [row] = await db
      .update(whatsappConfig)
      .set({ ...p.data, updatedAt: new Date() })
      .where(eq(whatsappConfig.id, cfg.id))
      .returning();
    return { config: { apiKey: row.apiKey, instanceUrl: row.instanceUrl, instanceName: row.instanceName } };
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
      const r = await uazapi("/instance/status", "GET", cfg);
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
    const r = await uazapi("/instance/qrcode", "GET", cfg);
    if (!r.ok) return reply.code(502).send({ error: "Falha ao gerar QR Code" });
    return { qrcode: r.data?.qrcode || r.data?.base64 || r.data?.code || null };
  });

  // POST /whatsapp/disconnect
  app.post("/whatsapp/disconnect", async (_req, reply) => {
    const cfg = await requireConfig(reply);
    if (!cfg) return;
    await uazapi("/instance/logout", "POST", cfg);
    return { ok: true };
  });

  // POST /whatsapp/restart
  app.post("/whatsapp/restart", async (_req, reply) => {
    const cfg = await requireConfig(reply);
    if (!cfg) return;
    await uazapi("/instance/restart", "POST", cfg);
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
      const r = await uazapi("/message/text", "POST", cfg, {
        number: cleanPhone,
        text: p.data.message,
      });
      return { success: r.ok };
    } catch {
      return { success: false };
    }
  });
}
