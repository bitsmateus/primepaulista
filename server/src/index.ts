import { buildApp } from "./app";
import { env } from "./env";
import { ensureBucket, storageEnabled } from "./storage/minio";

const app = buildApp();

async function start() {
  if (storageEnabled) {
    try {
      await ensureBucket();
      console.log("📦 MinIO conectado, bucket pronto.");
    } catch (err) {
      console.warn("⚠️  MinIO configurado mas inacessível:", (err as Error).message);
    }
  } else {
    console.log("ℹ️  MinIO não configurado — upload de fotos desativado.");
  }

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  console.log(`🚀 API rodando em http://localhost:${env.PORT}`);
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
