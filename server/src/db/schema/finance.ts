import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { expenseCategoryEnum, receivableStatusEnum } from "./enums";
import { profiles } from "./auth";
import { customers } from "./customers";
import { sales } from "./sales";

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  description: text("description").notNull(),
  category: expenseCategoryEnum("category").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  recurring: boolean("recurring").notNull().default(false),
});

export const sangrias = pgTable("sangrias", {
  id: uuid("id").primaryKey().defaultRandom(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  justification: text("justification"),
  userId: uuid("user_id").references(() => profiles.id),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
});

export const accountsReceivable = pgTable("accounts_receivable", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id").references(() => sales.id),
  customerId: uuid("customer_id").references(() => customers.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: receivableStatusEnum("status").notNull().default("pendente"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sellerCommissions = pgTable("seller_commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Configuração por nome do vendedor (mesmo modelo do PDV/relatórios)
  sellerName: text("seller_name").notNull().unique(),
  devicePercent: numeric("device_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  accessoryPercent: numeric("accessory_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
});

export type Expense = typeof expenses.$inferSelect;
export type Sangria = typeof sangrias.$inferSelect;
export type AccountReceivable = typeof accountsReceivable.$inferSelect;
export type SellerCommission = typeof sellerCommissions.$inferSelect;
