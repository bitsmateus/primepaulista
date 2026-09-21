// Conferência financeira (conciliação de pagamentos): tipos e regras puras.

export const AUDIT_STATUSES = ["Aguardando", "Conferido", "Divergente"] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
  Aguardando: "Aguardando",
  Conferido: "Conferido",
  Divergente: "Divergente / Em análise",
};

// Linha da lista de conferência (um pagamento de uma venda)
export interface ReconciliationRow {
  id: string;
  saleId: string;
  saleCode: string;
  createdAt: Date;
  customerName: string;
  sellerName: string;
  method: string;
  installments: number;
  amount: number;
  auditStatus: AuditStatus;
  auditNote: string;
  auditedByName: string;
  auditedAt: Date | null;
}

export type StatusSummary = Record<AuditStatus, { count: number; total: number }>;

export const EMPTY_SUMMARY: StatusSummary = {
  Aguardando: { count: 0, total: 0 },
  Conferido: { count: 0, total: 0 },
  Divergente: { count: 0, total: 0 },
};

// Filtros da conferência (iguais aos da API)
export interface ReconciliationFilters {
  from?: string; // AAAA-MM-DD
  to?: string;
  method?: string;
  status?: AuditStatus | "";
  seller?: string;
  q?: string;
}

// Remove chaves vazias para montar a query string
export function filtersToQuery(f: ReconciliationFilters, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) {
    if (v !== undefined && v !== null && String(v).trim() !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

// Texto do rótulo de um pagamento: "Cartão de Crédito 3x"
export function paymentLabel(method: string, installments?: number | null): string {
  return installments && installments > 1 ? `${method} ${installments}x` : method;
}

// Filtro sem chaves vazias (o servidor recusa texto vazio em datas/status)
export function cleanFilters(f: ReconciliationFilters): ReconciliationFilters {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  return out as ReconciliationFilters;
}
