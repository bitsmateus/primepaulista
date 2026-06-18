import type { FastifyInstance, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { whatsappInstances } from "../db/schema/index";
import { authenticate } from "../plugins/auth";
import { callUazapi, getInstance, getInstances } from "../services/whatsapp";
import { storageEnabled, uploadObject, presignedUrl } from "../storage/minio";

function detectImageExt(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

type JwtUser = { sub: string; name: string; role: string };

// Aceita apenas http(s) para evitar SSRF a esquemas internos
const urlSchema = z.string().max(500).url().refine((u) => /^https?:\/\//i.test(u), "URL deve ser http(s)");

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

  // Carrega a instância e exige que o usuário seja o dono ou admin
  async function requireOwnerOrAdmin(id: string, req: { user?: unknown }, reply: FastifyReply) {
    const inst = await getInstance(id);
    if (!inst) { reply.code(404).send({ error: "Instância não encontrada" }); return null; }
    const user = req.user as JwtUser;
    if (inst.ownerId && inst.ownerId !== user.sub && user.role !== "admin") {
      reply.code(403).send({ error: "Sem permissão para esta instância." });
      return null;
    }
    return inst;
  }

  // POST /whatsapp/instances — cria uma instância (dono = usuário logado)
  app.post("/whatsapp/instances", async (req, reply) => {
    const p = z
      .object({
        name: z.string().min(1).max(120),
        apiKey: z.string().max(500),
        instanceUrl: urlSchema,
        instanceName: z.string().max(200).optional().default(""),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos (verifique a URL)" });
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
        instanceUrl: urlSchema.optional(),
        instanceName: z.string().max(200).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos (verifique a URL)" });
    const cur = await requireOwnerOrAdmin(id, req, reply);
    if (!cur) return;
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

  // DELETE /whatsapp/instances/:id (dono ou admin)
  app.delete("/whatsapp/instances/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const inst = await requireOwnerOrAdmin(id, req, reply);
    if (!inst) return;
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
    const owned = await requireOwnerOrAdmin(id, req, reply);
    if (!owned) return;
    const inst = await requireInstance(id, reply);
    if (!inst) return;
    const r = await callUazapi(inst, "/instance/qrcode", "GET");
    if (!r.ok) return reply.code(502).send({ error: "Falha ao gerar QR Code" });
    return { qrcode: r.data?.qrcode || r.data?.base64 || r.data?.code || null };
  });

  app.post("/whatsapp/instances/:id/disconnect", async (req, reply) => {
    const { id } = req.params as { id: string };
    const owned = await requireOwnerOrAdmin(id, req, reply);
    if (!owned) return;
    const inst = await requireInstance(id, reply);
    if (!inst) return;
    await callUazapi(inst, "/instance/logout", "POST");
    return { ok: true };
  });

  app.post("/whatsapp/instances/:id/restart", async (req, reply) => {
    const { id } = req.params as { id: string };
    const owned = await requireOwnerOrAdmin(id, req, reply);
    if (!owned) return;
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

  // POST /whatsapp/instances/:id/send-media  { phone, imageUrl, caption }
  // NOTE: confirmar o path/payload de mídia da Uazapi (/send/media) antes de usar em produção.
  app.post("/whatsapp/instances/:id/send-media", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({ phone: z.string().min(1), imageUrl: z.string().min(1), caption: z.string().optional().default("") })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Telefone e imagem são obrigatórios" });
    const inst = await requireInstance(id, reply);
    if (!inst) return;
    try {
      const r = await callUazapi(inst, "/send/media", "POST", {
        number: p.data.phone.replace(/\D/g, ""),
        type: "image",
        file: p.data.imageUrl,
        text: p.data.caption,
      });
      return { success: r.ok };
    } catch {
      return { success: false };
    }
  });

  // POST /whatsapp/campaign-image  (multipart "file") → faz upload e devolve a URL
  app.post("/whatsapp/campaign-image", async (req, reply) => {
    if (!storageEnabled) return reply.code(503).send({ error: "Armazenamento (MinIO) não configurado." });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Nenhum arquivo enviado." });
    const buffer = await file.toBuffer();
    const ext = detectImageExt(buffer);
    if (!ext) return reply.code(400).send({ error: "Arquivo não é uma imagem válida (JPG, PNG ou WEBP)." });
    const objectKey = `campaigns/${crypto.randomUUID()}.${ext}`;
    await uploadObject(objectKey, buffer, `image/${ext === "jpg" ? "jpeg" : ext}`);
    return { url: await presignedUrl(objectKey) };
  });
}
