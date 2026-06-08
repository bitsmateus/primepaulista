import "dotenv/config";
import { Client } from "minio";

const endpoint = process.env.MINIO_ENDPOINT ?? "";
const bucket = process.env.MINIO_BUCKET ?? "prime-paulista";

export const storageEnabled = Boolean(
  endpoint && process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY
);

let client: Client | null = null;

export function getClient(): Client {
  if (!client) {
    client = new Client({
      endPoint: endpoint,
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY ?? "",
      secretKey: process.env.MINIO_SECRET_KEY ?? "",
    });
  }
  return client;
}

// Garante que o bucket existe (chamado no boot)
export async function ensureBucket() {
  if (!storageEnabled) return;
  const c = getClient();
  const exists = await c.bucketExists(bucket).catch(() => false);
  if (!exists) {
    await c.makeBucket(bucket);
  }
}

// Valida a imagem pela assinatura real (magic bytes), não pelo Content-Type
export function detectImage(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

export async function uploadObject(
  objectKey: string,
  buffer: Buffer,
  contentType: string
) {
  const c = getClient();
  await c.putObject(bucket, objectKey, buffer, buffer.length, {
    "Content-Type": contentType,
  });
  return objectKey;
}

export async function removeObject(objectKey: string) {
  const c = getClient();
  await c.removeObject(bucket, objectKey);
}

// URL temporária para exibir a foto (expira em 1h)
export function presignedUrl(objectKey: string, expirySeconds = 3600) {
  return getClient().presignedGetObject(bucket, objectKey, expirySeconds);
}

export { bucket };
