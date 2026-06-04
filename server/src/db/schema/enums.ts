import { pgEnum } from "drizzle-orm/pg-core";

// Usuários / cargos
export const roleEnum = pgEnum("role", ["admin", "vendedor", "tecnico"]);

// Estoque
export const deviceConditionEnum = pgEnum("device_condition", ["Lacrado", "Seminovo"]);
export const deviceStatusEnum = pgEnum("device_status", [
  "Disponível",
  "Vendido",
  "Em Manutenção",
  "Reservado",
]);
export const accessoryCategoryEnum = pgEnum("accessory_category", [
  "Capas",
  "Películas",
  "Cabos e Fontes",
]);

// Movimentação de estoque
export const productTypeEnum = pgEnum("product_type", ["device", "accessory"]);
export const movementTypeEnum = pgEnum("movement_type", ["entrada", "saida"]);

// Comercial / origem de lead
export const leadOriginEnum = pgEnum("lead_origin", [
  "Instagram",
  "Indicação",
  "Tráfego Pago",
]);

// Pagamento
export const paymentMethodEnum = pgEnum("payment_method", [
  "PIX",
  "Dinheiro",
  "Cartão de Crédito",
  "Cartão de Débito",
]);

// Assistência técnica
export const osStatusEnum = pgEnum("os_status", [
  "Aguardando Diagnóstico",
  "Aguardando Peça",
  "Em Reparo",
  "Pronto para Retirada",
  "Entregue / Finalizado",
]);
export const osPriorityEnum = pgEnum("os_priority", ["Normal", "Urgente", "Crítico"]);
export const osPhotoTypeEnum = pgEnum("os_photo_type", ["antes", "depois"]);

// Mensageria
export const messageStatusEnum = pgEnum("message_status", ["sent", "failed", "pending"]);

// Financeiro
export const expenseCategoryEnum = pgEnum("expense_category", [
  "Aluguel",
  "Condomínio",
  "Impostos (MEI)",
  "Tráfego Pago",
  "Salários",
  "Pro-labore",
  "Outros",
]);
export const receivableStatusEnum = pgEnum("receivable_status", [
  "pendente",
  "pago",
  "atrasado",
]);
