import { boolean, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./auth";

// Planejamento semanal: tarefas por dia da semana, com responsável e lembrete opcional.
export const weeklyTasks = pgTable("weekly_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  weekStart: date("week_start", { mode: "string" }).notNull(), // sempre a segunda-feira (YYYY-MM-DD)
  weekday: integer("weekday").notNull(), // 0 = segunda ... 6 = domingo
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  assigneeId: uuid("assignee_id").references(() => profiles.id, { onDelete: "set null" }),
  assigneeName: text("assignee_name").notNull().default(""),
  done: boolean("done").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
  // Lembrete: no sistema (entregue por consulta) e por WhatsApp (Uazapi), quando chega remind_at
  remindAt: timestamp("remind_at", { withTimezone: true }),
  remindedAt: timestamp("reminded_at", { withTimezone: true }), // entregue no sistema
  reminderMessage: text("reminder_message").notNull().default(""), // modelo com {nome} {tarefa} {dia}
  whatsappStatus: text("whatsapp_status"), // null (não tentou) | 'sent' | 'failed' | 'no_phone' | 'no_instance'
  whatsappError: text("whatsapp_error"),
  whatsappAt: timestamp("whatsapp_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdByName: text("created_by_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  weekIdx: index("weekly_tasks_week_idx").on(t.weekStart),
  assigneeIdx: index("weekly_tasks_assignee_idx").on(t.assigneeId),
}));

export type WeeklyTask = typeof weeklyTasks.$inferSelect;
