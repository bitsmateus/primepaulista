import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Configuração da instância WhatsApp (Uazapi). Linha única (singleton) — LEGADO,
// mantido para migrar a config existente para whatsapp_instances.
export const whatsappConfig = pgTable("whatsapp_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  apiKey: text("api_key").notNull().default(""),
  instanceUrl: text("instance_url").notNull().default(""),
  instanceName: text("instance_name").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Múltiplas instâncias/números de WhatsApp.
export const whatsappInstances = pgTable("whatsapp_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default("Principal"),
  apiKey: text("api_key").notNull().default(""),
  instanceUrl: text("instance_url").notNull().default(""),
  instanceName: text("instance_name").notNull().default(""),
  ownerId: uuid("owner_id"), // dono (profiles.id)
  ownerName: text("owner_name"), // nome do dono (denormalizado)
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WhatsappConfig = typeof whatsappConfig.$inferSelect;
export type WhatsappInstance = typeof whatsappInstances.$inferSelect;
