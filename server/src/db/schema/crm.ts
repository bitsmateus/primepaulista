import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
}, (t) => ({
  ownerIdx: index("leads_owner_id_idx").on(t.ownerId),
  statusIdx: index("leads_status_idx").on(t.status),
}));

export const messageLogs = pgTable("message_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientId: uuid("recipient_id"),
  recipientName: text("recipient_name"),
  recipientPhone: text("recipient_phone"),
  templateType: text("template_type"),
  message: text("message"),
  status: messageStatusEnum("status").notNull().default("pending"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  // Fase 5A: mensagens RECEBIDAS pelo webhook do WhatsApp entram aqui com direction = 'in'
  direction: text("direction").notNull().default("out"), // 'out' (enviada) | 'in' (recebida)
  externalId: text("external_id"), // id da mensagem no provedor (idempotência do webhook)
  instanceId: uuid("instance_id"), // número de WhatsApp que enviou/recebeu
  readAt: timestamp("read_at", { withTimezone: true }), // mensagem recebida ainda não vista = null
}, (t) => ({
  recipientIdx: index("message_logs_recipient_idx").on(t.recipientId),
  extUidx: uniqueIndex("message_logs_instance_ext_uidx").on(t.instanceId, t.externalId).where(sql`external_id is not null`),
}));

// Tarefas / follow-up de leads (com lembrete por data)
export const leadTasks = pgTable("lead_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  done: boolean("done").notNull().default(false),
  // Fase 5A: chave da sugestão automática da Agenda que originou a tarefa (ex.: "purchase:<cliente>:<venda>")
  sourceKey: text("source_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  leadIdx: index("lead_tasks_lead_id_idx").on(t.leadId),
}));

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
