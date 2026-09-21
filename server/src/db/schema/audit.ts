import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Registro de auditoria: quem fez o quê e quando. Só o admin consulta.
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  userName: text("user_name").notNull().default(""),
  action: text("action").notNull(), // ex.: "device.delete", "device.bulk_clear_price"
  entity: text("entity").notNull().default(""), // ex.: "device", "sale", "user"
  entityId: text("entity_id"),
  description: text("description").notNull().default(""),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  createdIdx: index("audit_logs_created_at_idx").on(t.createdAt),
  entityIdx: index("audit_logs_entity_idx").on(t.entity, t.entityId),
}));

export type AuditLog = typeof auditLogs.$inferSelect;
