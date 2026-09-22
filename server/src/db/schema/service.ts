import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { messageStatusEnum, osPhotoTypeEnum, osPriorityEnum, osStatusEnum } from "./enums";
import { customers } from "./customers";
import { accessories, devices } from "./inventory";
import { profiles } from "./auth";

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
  serialImei: text("serial_imei"), // IMEI 1
  imei2: text("imei2"), // IMEI 2 (dual SIM)
  serial: text("serial"), // número de série
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
  // Origem: aparelho do cliente ou do estoque da loja
  origin: text("origin").notNull().default("Cliente"), // "Cliente" | "Estoque da loja"
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  // Situação do aparelho de estoque antes de ir para a assistência (para restaurar)
  prevDeviceStatus: text("prev_device_status"),
  prevDeviceLocation: text("prev_device_location"),
  // Quem paga o custo: Cliente | Garantia da Loja | Cortesia / Loja | Dividido / Co-participação
  costResponsibility: text("cost_responsibility").notNull().default("Cliente"),
  // Metadados
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  deviceIdx: index("service_orders_device_id_idx").on(t.deviceId),
}));

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

// Histórico de notificações de WhatsApp enviadas (ou tentadas) por OS
export const osNotifications = pgTable("os_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  osId: uuid("os_id")
    .notNull()
    .references(() => serviceOrders.id, { onDelete: "cascade" }),
  event: text("event").notNull(), // aguardando_aprovacao | pronto_retirada | entregue
  phone: text("phone").notNull().default(""),
  message: text("message").notNull().default(""),
  status: messageStatusEnum("status").notNull().default("pending"), // sent | failed | pending
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
}, (t) => ({
  osIdx: index("os_notifications_os_id_idx").on(t.osId),
  createdIdx: index("os_notifications_created_at_idx").on(t.createdAt),
}));

// Configurações genéricas da loja (chave -> JSON). Só chaves da whitelist em services/settings.ts
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
});

export type OsNotification = typeof osNotifications.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type ServiceOrder = typeof serviceOrders.$inferSelect;
export type NewServiceOrder = typeof serviceOrders.$inferInsert;
export type ServiceOrderPhoto = typeof serviceOrderPhotos.$inferSelect;
