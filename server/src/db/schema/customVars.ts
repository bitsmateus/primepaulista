import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Variáveis customizadas (chaves de integração etc.). O valor é gravado CIFRADO
// (AES-256-GCM) e nunca é devolvido em listagens.
export const customVariables = pgTable("custom_variables", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(), // MAIUSCULAS_COM_UNDERSCORE
  valueEnc: text("value_enc").notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomVariable = typeof customVariables.$inferSelect;
