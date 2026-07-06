export type OSStatus =
  | "Aguardando Diagnóstico"
  | "Aguardando Peça"
  | "Em Reparo"
  | "Pronto para Retirada"
  | "Entregue / Finalizado";

export type OSPriority = "Normal" | "Urgente" | "Crítico";

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
  chargedAmount: number;
  taxes: number;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
