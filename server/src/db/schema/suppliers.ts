import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Fornecedores (de onde vêm os aparelhos comprados e as contas a pagar)
export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  document: text("document").notNull().default(""), // CNPJ/CPF, só dígitos
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameIdx: index("suppliers_name_idx").on(t.name),
}));

export type Supplier = typeof suppliers.$inferSelect;
