import {
  boolean,
  index,
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
  giftsCost: numeric("gifts_cost", { precision: 12, scale: 2 }).notNull().default("0"), // custo dos brindes incluídos na venda
  requiresInvoice: boolean("requires_invoice").notNull().default(false), // cliente exigiu emissão de nota fiscal
  notes: text("notes"), // descrição / observação da venda
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  returnedAt: timestamp("returned_at", { withTimezone: true }), // data da devolução/estorno (se houver)
}, (t) => ({
  customerIdx: index("sales_customer_id_idx").on(t.customerId),
  createdIdx: index("sales_created_at_idx").on(t.createdAt),
}));

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
}, (t) => ({
  saleIdx: index("sale_items_sale_id_idx").on(t.saleId),
}));

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  method: paymentMethodEnum("method").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  installments: integer("installments").default(1),
}, (t) => ({
  saleIdx: index("payments_sale_id_idx").on(t.saleId),
}));

export const tradeIns = pgTable("trade_ins", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  imei: text("imei"),
  model: text("model"),
  healthDescription: text("health_description"),
  value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
}, (t) => ({
  saleIdx: index("trade_ins_sale_id_idx").on(t.saleId),
}));

// Devolução/estorno de uma venda (estorno total, restitui o estoque)
export const saleReturns = pgTable("sale_returns", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  reason: text("reason").notNull().default(""),
  refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  userId: uuid("user_id").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Anexos da venda (nota fiscal, comprovantes) — arquivo no MinIO
export const saleAttachments = pgTable("sale_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  filename: text("filename").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  saleIdx: index("sale_attachments_sale_id_idx").on(t.saleId),
}));

export type Sale = typeof sales.$inferSelect;
export type SaleItem = typeof saleItems.$inferSelect;
export type SaleAttachment = typeof saleAttachments.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type TradeIn = typeof tradeIns.$inferSelect;
