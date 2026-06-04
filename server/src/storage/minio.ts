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
