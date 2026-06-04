import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index";
import { serviceOrderPhotos } from "../db/schema/index";
import { authenticate } from "../plugins/auth";
import {
  storageEnabled,
  uploadObject,
  removeObject,
  presignedUrl,
} from "../storage/minio";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export async function serviceOrderPhotoRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /service-orders/:id/photos  → fotos com URL temporária
  app.get("/service-orders/:id/photos", async (req) => {
    const { id } = req.params as { id: string };
    const rows = await db
      .select()
      .from(serviceOrderPhotos)
      .where(eq(serviceOrderPhotos.serviceOrderId, id));

    const photos = await Promise.all(
      rows.map(async (p) => ({
        id: p.id,
        type: p.type,
        url: storageEnabled ? await presignedUrl(p.objectKey) : "",
        createdAt: p.createdAt,
      }))
    );
    return { photos };
  });

  // POST /service-orders/:id/photos?type=antes|depois  (multipart, campo "file")
  app.post("/service-orders/:id/photos", async (req, reply) => {
    if (!storageEnabled) {
      return reply
        .code(503)
        .send({ error: "Armazenamento de fotos (MinIO) não configurado." });
    }
    const { id } = req.params as { id: string };
    const { type } = req.query as { type?: string };
    if (type !== "antes" && type !== "depois") {
      return reply.code(400).send({ error: "Parâmetro 'type' deve ser antes ou depois." });
    }

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Nenhum arquivo enviado." });
    if (!ALLOWED.includes(file.mimetype)) {
      return reply.code(400).send({ error: "Formato inválido (use JPG, PNG ou WEBP)." });
    }

    const buffer = await file.toBuffer();
    const ext = file.mimetype.split("/")[1];
    const objectKey = `os/${id}/${type}/${crypto.randomUUID()}.${ext}`;
    await uploadObject(objectKey, buffer, file.mimetype);

    const [row] = await db
      .insert(serviceOrderPhotos)
      .values({ serviceOrderId: id, type, objectKey })
      .returning();

    return reply.code(201).send({
      photo: {
        id: row.id,
        type: row.type,
        url: await presignedUrl(objectKey),
        createdAt: row.createdAt,
      },
    });
  });

  // DELETE /service-orders/:id/photos/:photoId
  app.delete("/service-orders/:id/photos/:photoId", async (req, reply) => {
    const { id, photoId } = req.params as { id: string; photoId: string };
    const [row] = await db
      .select()
      .from(serviceOrderPhotos)
      .where(
        and(
          eq(serviceOrderPhotos.id, photoId),
          eq(serviceOrderPhotos.serviceOrderId, id)
        )
      )
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Foto não encontrada" });

    if (storageEnabled) {
      await removeObject(row.objectKey).catch(() => {});
    }
    await db.delete(serviceOrderPhotos).where(eq(serviceOrderPhotos.id, photoId));
    return { ok: true };
  });
}
