import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Regras de automação do CRM (pós-venda, reativação, ...). Uma linha por tipo.
export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // 'pos_venda' | 'reativacao'
  enabled: boolean("enabled").notNull().default(false),
  daysAfter: integer("days_after").notNull().default(3),
  message: text("message").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Automation = typeof automations.$inferSelect;
