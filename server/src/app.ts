import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { deviceRoutes } from "./routes/devices";
import { devicePhotoRoutes } from "./routes/devicePhotos";
import { accessoryRoutes } from "./routes/accessories";
import { customerRoutes } from "./routes/customers";
import { saleRoutes } from "./routes/sales";
import { serviceOrderRoutes } from "./routes/serviceOrders";
import { saleAttachmentRoutes } from "./routes/saleAttachments";
import { serviceOrderPhotoRoutes } from "./routes/serviceOrderPhotos";
import { crmRoutes } from "./routes/crm";
import { whatsappRoutes } from "./routes/whatsapp";
import { automationRoutes } from "./routes/automations";
import { financeRoutes } from "./routes/finance";
import { quoteRoutes } from "./routes/quotes";
import { settingsRoutes } from "./routes/settings";
import { supplierRoutes } from "./routes/suppliers";
import { auditLogRoutes } from "./routes/auditLogs";
import { customVarRoutes } from "./routes/customVars";
import { backupRoutes } from "./routes/backup";
import { notificationRoutes } from "./routes/notifications";
import { reconciliationRoutes } from "./routes/reconciliation";
import { planningRoutes } from "./routes/planning";
import { quickReplyRoutes } from "./routes/quickReplies";
import { keywordRuleRoutes } from "./routes/keywordRules";
import { whatsappWebhookRoutes } from "./routes/whatsappWebhook";
import { aiRoutes } from "./routes/ai";
import { registerAiRules } from "./services/aiRules";

export function buildApp() {
  const app = Fastify({ logger: true });

  // Origens permitidas: lista do env, ou todas (dev) se não configurado
  const corsOrigins = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",").map((o) => o.trim())
    : true;

  app.register(helmet, { contentSecurityPolicy: false }); // headers de segurança
  app.register(cors, { origin: corsOrigins, credentials: true });
  app.register(rateLimit, { max: 200, timeWindow: "1 minute" }); // limite global
  app.register(jwt, { secret: env.JWT_SECRET });
  app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } }); // até 15MB por foto

  // Aceita corpo vazio em requisições JSON (ex.: DELETE sem body)
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      if (!body || (body as string).trim() === "") return done(null, undefined);
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    }
  );

  app.get("/health", async () => ({ status: "ok" }));

  app.register(authRoutes);
  app.register(userRoutes);
  app.register(deviceRoutes);
  app.register(devicePhotoRoutes);
  app.register(accessoryRoutes);
  app.register(customerRoutes);
  app.register(saleRoutes);
  app.register(saleAttachmentRoutes);
  app.register(serviceOrderRoutes);
  app.register(serviceOrderPhotoRoutes);
  app.register(crmRoutes);
  app.register(whatsappRoutes);
  app.register(automationRoutes);
  app.register(financeRoutes);
  app.register(quoteRoutes);
  app.register(settingsRoutes);
  app.register(supplierRoutes);
  app.register(auditLogRoutes);
  app.register(customVarRoutes);
  app.register(backupRoutes);
  app.register(notificationRoutes);
  app.register(reconciliationRoutes);
  app.register(planningRoutes);
  app.register(quickReplyRoutes);
  app.register(keywordRuleRoutes);
  app.register(aiRoutes);
  registerAiRules(); // regras com ação "IA" (Fase 5B) passam a responder pelo Gemini
  app.register(whatsappWebhookRoutes); // público (segredo na URL): mantém o próprio parser de corpo

  return app;
}
