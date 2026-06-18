import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { messageStatusEnum } from "./enums";

export const funnelColumns = pgTable("funnel_columns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull().default(0),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  modelInterest: text("model_interest"),
  origin: text("origin"),
  status: text("status").notNull().default("Novo"), // nome da coluna do funil
  notes: text("notes"),
  ownerId: uuid("owner_id"), // vendedor dono do lead (profiles.id)
  ownerName: text("owner_name"), // nome do dono (denormalizado p/ exibição)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageLogs = pgTable("message_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id"),
  recipientName: text("recipient_name"),
  recipientPhone: text("recipient_phone"),
  templateType: text("template_type"),
  message: text("message"),
  status: messageStatusEnum("status").notNull().default("pending"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

// Tarefas / follow-up de leads (com lembrete por data)
export const leadTasks = pgTable("lead_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Campanhas de disparo em massa
export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  segment: text("segment"), // ex: "comprou", "nao_comprou", "interesse:iPhone 15"
  templateType: text("template_type"),
  message: text("message"),
  status: text("status").notNull().default("rascunho"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Lead = typeof leads.$inferSelect;
export type FunnelColumn = typeof funnelColumns.$inferSelect;
export type MessageLog = typeof messageLogs.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
