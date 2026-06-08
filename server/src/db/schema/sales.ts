import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { paymentMethodEnum, productTypeEnum } from "./enums";
import { customers } from "./customers";
import { profiles } from "./auth";

export const sales = pgTable("sales", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").references(() => customers.id),
  sellerId: uuid("seller_id").references(() => profiles.id), // usuário logado que registrou
  sellerName: text("seller_name"), // vendedor selecionado no PDV (ex.: Gabriel)
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  tradeInDiscount: numeric("trade_in_discount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"), // desconto geral
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const saleItems = pgTable("sale_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  productType: productTypeEnum("product_type").notNull(),
  productId: uuid("product_id"),
  name: text("name").notNull(),
  serial: text("serial"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  quantity: integer("quantity").notNull().default(1),
  warrantyDays: integer("warranty_days").notNull().default(0), // garantia do aparelho em dias
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  method: paymentMethodEnum("method").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  installments: integer("installments").default(1),
});

export const tradeIns = pgTable("trade_ins", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  imei: text("imei"),
  model: text("model"),
  healthDescription: text("health_description"),
  value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
});

export type Sale = typeof sales.$inferSelect;
export type SaleItem = typeof saleItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type TradeIn = typeof tradeIns.$inferSelect;
