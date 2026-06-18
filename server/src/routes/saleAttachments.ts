import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index";
import { saleAttachments, sales } from "../db/schema/index";
import { authenticate, requireRole } from "../plugins/auth";
import { storageEnabled, uploadObject, removeObject, presignedUrl } from "../storage/minio";

// Detecta o tipo real pelo magic bytes (NF costuma ser PDF; também aceita imagem)
function detectType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "%PDF") return { mime: "application/pdf", ext: "pdf" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export async function saleAttachmentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /sales/:id/attachments
  app.get("/sales/:id/attachments", async (req) => {
    const { id } = req.params as { id: string };
    const rows = await db.select().from(saleAttachments).where(eq(saleAttachments.saleId, id));
    const attachments = await Promise.all(
      rows.map(async (a) => ({
        id: a.id,
        filename: a.filename,
        url: storageEnabled ? await presignedUrl(a.objectKey) : "",
        createdAt: a.createdAt,
      }))
    );
    return { attachments };
  });

  // POST /sales/:id/attachments  (multipart, campo "file") — somente admin
  app.post("/sales/:id/attachments", { preHandler: requireRole("admin") }, async (req, reply) => {
    if (!storageEnabled) {
      return reply.code(503).send({ error: "Armazenamento (MinIO) não configurado." });
    }
    const { id } = req.params as { id: string };
    const [sale] = await db.select({ id: sales.id }).from(sales).where(eq(sales.id, id)).limit(1);
    if (!sale) return reply.code(404).send({ error: "Venda não encontrada." });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Nenhum arquivo enviado." });
    const buffer = await file.toBuffer();
    const real = detectType(buffer);
    if (!real) {
      return reply.code(400).send({ error: "Formato inválido (use PDF, JPG, PNG ou WEBP)." });
    }
    const objectKey = `sales/${id}/${crypto.randomUUID()}.${real.ext}`;
    await uploadObject(objectKey, buffer, real.mime);

    const safeName = (file.filename || `nota.${real.ext}`).slice(0, 200);
    const [row] = await db
      .insert(saleAttachments)
      .values({ saleId: id, objectKey, filename: safeName })
      .returning();

    return reply.code(201).send({
      attachment: { id: row.id, filename: row.filename, url: await presignedUrl(objectKey), createdAt: row.createdAt },
    });
  });

  // DELETE /sales/:id/attachments/:attId — somente admin
  app.delete("/sales/:id/attachments/:attId", { preHandler: requireRole("admin") }, async (req, reply) => {
    const { id, attId } = req.params as { id: string; attId: string };
    const [row] = await db
      .select()
      .from(saleAttachments)
      .where(and(eq(saleAttachments.id, attId), eq(saleAttachments.saleId, id)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Anexo não encontrado" });
    if (storageEnabled) await removeObject(row.objectKey).catch(() => {});
    await db.delete(saleAttachments).where(eq(saleAttachments.id, attId));
    return { ok: true };
  });
}
