import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { productTypeEnum, quoteStatusEnum } from "./enums";
import { customers } from "./customers";
import { profiles } from "./auth";

// Orçamentos comerciais. Não reservam estoque: viram venda pelo PDV.
export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: integer("number").notNull().generatedAlwaysAsIdentity(), // "Orçamento nº 12"
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull().default(""),
  customerPhone: text("customer_phone").notNull().default(""),
  sellerId: uuid("seller_id").references(() => profiles.id),
  sellerName: text("seller_name").notNull().default(""),
  status: quoteStatusEnum("status").notNull().default("Aberto"),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentTerms: text("payment_terms").notNull().default(""),
  notes: text("notes").notNull().default(""),
  convertedSaleId: uuid("converted_sale_id"), // venda gerada (sem FK: evita dependência circular)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  statusIdx: index("quotes_status_idx").on(t.status),
  createdIdx: index("quotes_created_at_idx").on(t.createdAt),
}));

export const quoteItems = pgTable("quote_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  productType: productTypeEnum("product_type").notNull(),
  productId: uuid("product_id"), // aparelho/acessório do estoque (opcional)
  name: text("name").notNull(),
  serial: text("serial"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  quantity: integer("quantity").notNull().default(1),
}, (t) => ({
  quoteIdx: index("quote_items_quote_id_idx").on(t.quoteId),
}));

export type Quote = typeof quotes.$inferSelect;
export type QuoteItem = typeof quoteItems.$inferSelect;
