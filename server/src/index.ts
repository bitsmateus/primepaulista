import cron from "node-cron";
import { buildApp } from "./app";
import { env } from "./env";
import { ensureBucket, storageEnabled } from "./storage/minio";
import { runAutomations } from "./services/automations";

const app = buildApp();

// Agendador: roda as automações do CRM todo dia às 09:00 (horário do servidor)
cron.schedule("0 9 * * *", async () => {
  try {
    const summary = await runAutomations();
    console.log("⏰ Automações executadas:", JSON.stringify(summary));
  } catch (err) {
    console.error("⏰ Falha nas automações:", (err as Error).message);
  }
});

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
