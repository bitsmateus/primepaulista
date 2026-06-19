import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { leadOriginEnum } from "./enums";

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  cpf: text("cpf"),
  whatsapp: text("whatsapp"),
  birthday: text("birthday"), // formato livre (dd/mm); usar date depois se necessário
  leadOrigin: leadOriginEnum("lead_origin"),
  notes: text("notes"), // observações / descrição do cliente
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
