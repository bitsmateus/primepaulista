export type ExpenseCategory =
  | "Aluguel"
  | "Condomínio"
  | "Impostos (MEI)"
  | "Tráfego Pago"
  | "Salários"
  | "Pro-labore"
  | "Outros";

export interface Expense {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  date: Date;
  recurring: boolean;
}

export interface Sangria {
  id: string;
  amount: number;
  justification: string;
  date: Date;
}

export interface SellerCommissionConfig {
  seller: string;
  devicePercent: number;
  accessoryPercent: number;
}

export interface DailyCashEntry {
  date: string;
  pix: number;
  dinheiro: number;
  creditCard: number;
  debitCard: number;
  sangrias: number;
  total: number;
}
