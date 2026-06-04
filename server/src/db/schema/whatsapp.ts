import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Configuração da instância WhatsApp (Uazapi). Linha única (singleton).
export const whatsappConfig = pgTable("whatsapp_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  apiKey: text("api_key").notNull().default(""),
  instanceUrl: text("instance_url").notNull().default(""),
  instanceName: text("instance_name").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WhatsappConfig = typeof whatsappConfig.$inferSelect;
