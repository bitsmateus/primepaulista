import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { env } from "./env";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { deviceRoutes } from "./routes/devices";
import { accessoryRoutes } from "./routes/accessories";
import { customerRoutes } from "./routes/customers";
import { saleRoutes } from "./routes/sales";
import { serviceOrderRoutes } from "./routes/serviceOrders";
import { serviceOrderPhotoRoutes } from "./routes/serviceOrderPhotos";
import { crmRoutes } from "./routes/crm";
import { whatsappRoutes } from "./routes/whatsapp";
import { automationRoutes } from "./routes/automations";
import { financeRoutes } from "./routes/finance";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true, credentials: true });
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
  app.register(accessoryRoutes);
  app.register(customerRoutes);
  app.register(saleRoutes);
  app.register(serviceOrderRoutes);
  app.register(serviceOrderPhotoRoutes);
  app.register(crmRoutes);
  app.register(whatsappRoutes);
  app.register(automationRoutes);
  app.register(financeRoutes);

  return app;
}
