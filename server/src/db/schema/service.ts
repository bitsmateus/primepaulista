import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { osPhotoTypeEnum, osPriorityEnum, osStatusEnum } from "./enums";
import { customers } from "./customers";
import { accessories } from "./inventory";

export const serviceOrders = pgTable("service_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Cliente
  customerId: uuid("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerCpf: text("customer_cpf"),
  // Aparelho
  model: text("model").notNull(),
  color: text("color"),
  serialImei: text("serial_imei"),
  batteryHealth: integer("battery_health"),
  // Diagnóstico
  reportedIssue: text("reported_issue").notNull(),
  technicalNotes: text("technical_notes"),
  checklistCapa: boolean("checklist_capa").notNull().default(false),
  checklistChip: boolean("checklist_chip").notNull().default(false),
  checklistCarregador: boolean("checklist_carregador").notNull().default(false),
  // Reparo
  status: osStatusEnum("status").notNull().default("Aguardando Diagnóstico"),
  priority: osPriorityEnum("priority").notNull().default("Normal"),
  partCost: numeric("part_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  laborCost: numeric("labor_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  partDescription: text("part_description"),
  partFromStock: boolean("part_from_stock").notNull().default(false),
  stockAccessoryId: uuid("stock_accessory_id").references(() => accessories.id),
  // Financeiro
  chargedAmount: numeric("charged_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  taxes: numeric("taxes", { precision: 12, scale: 2 }).notNull().default("0"),
  // Metadados
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// Fotos antes/depois da OS (arquivos guardados no MinIO; aqui fica a referência)
export const serviceOrderPhotos = pgTable("service_order_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceOrderId: uuid("service_order_id")
    .notNull()
    .references(() => serviceOrders.id, { onDelete: "cascade" }),
  type: osPhotoTypeEnum("type").notNull(),
  objectKey: text("object_key").notNull(), // caminho do arquivo no MinIO
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServiceOrder = typeof serviceOrders.$inferSelect;
export type NewServiceOrder = typeof serviceOrders.$inferInsert;
export type ServiceOrderPhoto = typeof serviceOrderPhotos.$inferSelect;
