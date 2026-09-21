export type OSStatus =
  | "Aguardando Diagnóstico"
  | "Em Diagnóstico"
  | "Aguardando Aprovação"
  | "Aguardando Peça"
  | "Em Reparo"
  | "Pronto para Retirada"
  | "Entregue / Finalizado";

export type OSPriority = "Normal" | "Urgente" | "Crítico";

// Origem da OS: aparelho trazido pelo cliente ou aparelho do estoque da loja
export type OSOrigin = "Cliente" | "Estoque da loja";

// Quem paga o custo do reparo
export type CostResponsibility = "Cliente" | "Garantia da Loja" | "Cortesia / Loja" | "Dividido / Co-participação";

export type OSEvent = "aguardando_aprovacao" | "pronto_retirada" | "entregue";

export type NotificationStatus = "sent" | "failed" | "pending";

export interface ChecklistEntry {
  capa: boolean;
  chip: boolean;
  carregador: boolean;
}

export interface ServiceOrder {
  id: string;
  // Customer
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerCpf: string;
  // Device
  model: string;
  color: string;
  serialImei: string; // IMEI 1
  imei2?: string; // IMEI 2 (dual SIM)
  serial?: string; // número de série
  batteryHealth: number;
  // Diagnosis
  reportedIssue: string;
  technicalNotes: string;
  checklist: ChecklistEntry;
  // Repair
  status: OSStatus;
  priority: OSPriority;
  partCost: number;
  laborCost: number;
  partDescription: string;
  partFromStock: boolean;
  stockAccessoryId?: string;
  // Financials
  chargedAmount: number; // em "Dividido": parte paga pelo cliente
  taxes: number;
  // Origem e responsabilidade pelo custo
  origin: OSOrigin;
  deviceId?: string;
  costResponsibility: CostResponsibility;
  // Eventos de WhatsApp já enviados com sucesso (só leitura; vem do servidor)
  sentEvents?: OSEvent[];
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
