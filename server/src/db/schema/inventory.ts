import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  accessoryCategoryEnum,
  deviceConditionEnum,
  deviceStatusEnum,
  movementTypeEnum,
  productTypeEnum,
} from "./enums";
import { profiles } from "./auth";

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Categoria do dispositivo: iPhone, iPad, Apple Watch, Mac, AirPods, Outro
  category: text("category").notNull().default("iPhone"),
  model: text("model").notNull(),
  capacity: text("capacity").notNull().default(""),
  color: text("color").notNull(),
  condition: deviceConditionEnum("condition").notNull(),
  batteryHealth: integer("battery_health").notNull().default(100),
  supplier: text("supplier"),
  cost: numeric("cost", { precision: 12, scale: 2 }).notNull().default("0"),
  salePrice: numeric("sale_price", { precision: 12, scale: 2 }), // preço de venda (para margem)
  serialImei: text("serial_imei"),
  internalSerial: text("internal_serial"),
  status: deviceStatusEnum("status").notNull().default("Disponível"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accessories = pgTable("accessories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: accessoryCategoryEnum("category").notNull(),
  subcategory: text("subcategory"),
  compatibleModel: text("compatible_model"),
  quantity: integer("quantity").notNull().default(0),
  minQuantity: integer("min_quantity").notNull().default(0),
  cost: numeric("cost", { precision: 12, scale: 2 }).notNull().default("0"),
  price: numeric("price", { precision: 12, scale: 2 }),
  barcode: text("barcode"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Histórico de entrada/saída de produtos
export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  productType: productTypeEnum("product_type").notNull(),
  productId: uuid("product_id").notNull(),
  movementType: movementTypeEnum("movement_type").notNull(),
  quantity: integer("quantity").notNull().default(1),
  reason: text("reason"),
  userId: uuid("user_id").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type Accessory = typeof accessories.$inferSelect;
export type NewAccessory = typeof accessories.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
