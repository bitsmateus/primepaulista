import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index";
import { devicePhotos, devices } from "../db/schema/index";
import { authenticate } from "../plugins/auth";
import {
  storageEnabled,
  uploadObject,
  removeObject,
  presignedUrl,
  detectImage,
} from "../storage/minio";

export async function devicePhotoRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /devices/:id/photos
  app.get("/devices/:id/photos", async (req) => {
    const { id } = req.params as { id: string };
    const rows = await db
      .select()
      .from(devicePhotos)
      .where(eq(devicePhotos.deviceId, id));
    const photos = await Promise.all(
      rows.map(async (p) => ({
        id: p.id,
        url: storageEnabled ? await presignedUrl(p.objectKey) : "",
        createdAt: p.createdAt,
      }))
    );
    return { photos };
  });

  // POST /devices/:id/photos (multipart, campo "file")
  app.post("/devices/:id/photos", async (req, reply) => {
    if (!storageEnabled) {
      return reply.code(503).send({ error: "Armazenamento de fotos (MinIO) não configurado." });
    }
    const { id } = req.params as { id: string };

    const [device] = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.id, id))
      .limit(1);
    if (!device) return reply.code(404).send({ error: "Aparelho não encontrado." });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Nenhum arquivo enviado." });

    const buffer = await file.toBuffer();
    const realType = detectImage(buffer);
    if (!realType) {
      return reply.code(400).send({ error: "Arquivo não é uma imagem válida (JPG, PNG ou WEBP)." });
    }
    const ext = realType.split("/")[1];
    const objectKey = `devices/${id}/${crypto.randomUUID()}.${ext}`;
    await uploadObject(objectKey, buffer, realType);

    const [row] = await db
      .insert(devicePhotos)
      .values({ deviceId: id, objectKey })
      .returning();
    return reply.code(201).send({
      photo: { id: row.id, url: await presignedUrl(objectKey), createdAt: row.createdAt },
    });
  });

  // DELETE /devices/:id/photos/:photoId
  app.delete("/devices/:id/photos/:photoId", async (req, reply) => {
    const { id, photoId } = req.params as { id: string; photoId: string };
    const [row] = await db
      .select()
      .from(devicePhotos)
      .where(and(eq(devicePhotos.id, photoId), eq(devicePhotos.deviceId, id)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Foto não encontrada" });
    if (storageEnabled) await removeObject(row.objectKey).catch(() => {});
    await db.delete(devicePhotos).where(eq(devicePhotos.id, photoId));
    return { ok: true };
  });
}
