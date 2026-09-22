import { ServiceOrder, OSStatus, OSPriority, OSOrigin, OSEvent, CostResponsibility } from "@/types/serviceOrder";
import { onlyDigits } from "@/lib/customers";
import { isExemptResponsibility } from "@/lib/osMessages";

// Ordem das colunas do Kanban / etapas do fluxo
export const OS_STATUSES: OSStatus[] = [
  "Aguardando Diagnóstico",
  "Em Diagnóstico",
  "Aguardando Aprovação",
  "Aguardando Peça",
  "Em Reparo",
  "Pronto para Retirada",
  "Entregue / Finalizado",
];

export const OS_PRIORITIES: OSPriority[] = ["Normal", "Urgente", "Crítico"];

export const FINALIZED: OSStatus = "Entregue / Finalizado";
export const READY: OSStatus = "Pronto para Retirada";
export const AWAITING_APPROVAL: OSStatus = "Aguardando Aprovação";

export const OS_ORIGINS: OSOrigin[] = ["Cliente", "Estoque da loja"];
export const COST_RESPONSIBILITIES: CostResponsibility[] = [
  "Cliente",
  "Garantia da Loja",
  "Cortesia / Loja",
  "Dividido / Co-participação",
];

// OS aberta = tudo que não foi entregue/finalizado
export const isOpenOS = (o: Pick<ServiceOrder, "status">): boolean => o.status !== FINALIZED;

// Status que disparam aviso por WhatsApp
export const EVENT_BY_STATUS: Partial<Record<OSStatus, OSEvent>> = {
  "Aguardando Aprovação": "aguardando_aprovacao",
  "Pronto para Retirada": "pronto_retirada",
  "Entregue / Finalizado": "entregue",
};

// Garantia / cortesia: nada é cobrado do cliente (campo trava em R$ 0,00)
export const isExempt = (resp?: CostResponsibility | string | null): boolean => isExemptResponsibility(resp);

// Valor que efetivamente vale para a OS: isento sempre zera
export function effectiveCharged(o: Pick<ServiceOrder, "chargedAmount" | "costResponsibility">): number {
  return isExempt(o.costResponsibility) ? 0 : o.chargedAmount;
}

// Rótulo do campo de valor no formulário: em "Dividido" é só a parte do cliente
export function chargedFieldLabel(resp?: CostResponsibility): string {
  return resp === "Dividido / Co-participação" ? "Parte paga pelo cliente (R$)" : "Valor Cobrado (R$)";
}

// Linha de valor do recibo de OS (texto puro; quem monta o HTML escapa)
export function receiptValueLine(
  o: Pick<ServiceOrder, "chargedAmount" | "costResponsibility">,
  fmt: (v: number) => string
): { label: string; value: string; note?: string } {
  if (o.costResponsibility === "Garantia da Loja")
    return { label: "Total do serviço", value: `${fmt(0)} (ISENTO - COBERTO PELA GARANTIA DA LOJA)` };
  if (o.costResponsibility === "Cortesia / Loja")
    return { label: "Total do serviço", value: `${fmt(0)} (ISENTO - CORTESIA DA LOJA)` };
  if (o.costResponsibility === "Dividido / Co-participação")
    return { label: "Valor pago pelo cliente", value: fmt(o.chargedAmount), note: "Custo dividido com a loja" };
  return { label: "Total do serviço", value: fmt(o.chargedAmount) };
}

// OS que já deveria ter recebido aviso por WhatsApp e ainda não tem envio com sucesso
// para o evento da etapa atual. `enabled` (opcional): eventos desligados não geram pendência.
// OS de estoque sem telefone não tem cliente para avisar e fica de fora.
export function needsNotification(
  o: Pick<ServiceOrder, "status" | "origin" | "customerPhone" | "sentEvents">,
  enabled?: Partial<Record<OSEvent, boolean>>
): boolean {
  if (o.status !== READY && o.status !== AWAITING_APPROVAL) return false;
  const ev = EVENT_BY_STATUS[o.status];
  if (!ev) return false;
  if (enabled && enabled[ev] === false) return false;
  if (o.origin === "Estoque da loja" && !onlyDigits(o.customerPhone ?? "")) return false;
  return !(o.sentEvents ?? []).includes(ev);
}

const DAY = 1000 * 60 * 60 * 24;

// Lucro líquido da OS (consistente com BI e PDV): cobrado − peça − impostos.
export function osProfit(o: Pick<ServiceOrder, "chargedAmount" | "partCost" | "taxes">): number {
  return o.chargedAmount - o.partCost - o.taxes;
}

// Dias desde a abertura (para OS finalizada, até a conclusão).
export function daysInLab(o: Pick<ServiceOrder, "createdAt" | "completedAt" | "status">, now: Date): number {
  const end = o.status === FINALIZED && o.completedAt ? new Date(o.completedAt).getTime() : now.getTime();
  return Math.floor((end - new Date(o.createdAt).getTime()) / DAY);
}

// OS em aberto há mais de `slaDays` dias.
export function isOverdue(o: Pick<ServiceOrder, "createdAt" | "status">, now: Date, slaDays = 3): boolean {
  if (o.status === FINALIZED) return false;
  return Math.floor((now.getTime() - new Date(o.createdAt).getTime()) / DAY) > slaDays;
}

// Busca por cliente, telefone (ignora formatação), modelo, IMEI ou defeito.
export function osMatchesSearch(o: ServiceOrder, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = onlyDigits(q);
  if (o.customerName.toLowerCase().includes(q)) return true;
  if (o.model.toLowerCase().includes(q)) return true;
  if (o.serialImei.toLowerCase().includes(q)) return true;
  if (o.reportedIssue.toLowerCase().includes(q)) return true;
  if (qDigits && onlyDigits(o.customerPhone).includes(qDigits)) return true;
  return false;
}

export interface OSFilters {
  search: string;
  priority: string; // "all" | prioridade
  origin: string; // "all" | origem
  responsibility: string; // "all" | quem paga
  pendingOnly: boolean;
}

export const DEFAULT_OS_FILTERS: OSFilters = { search: "", priority: "all", origin: "all", responsibility: "all", pendingOnly: false };

export function filterOrders(
  orders: ServiceOrder[],
  f: OSFilters,
  enabled?: Partial<Record<OSEvent, boolean>>
): ServiceOrder[] {
  return orders.filter(
    (o) =>
      osMatchesSearch(o, f.search) &&
      (f.priority === "all" || o.priority === f.priority) &&
      (f.origin === "all" || o.origin === f.origin) &&
      (f.responsibility === "all" || o.costResponsibility === f.responsibility) &&
      (!f.pendingOnly || needsNotification(o, enabled))
  );
}

function sameMonth(d: Date, now: Date): boolean {
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export interface OSReport {
  total: number;
  open: number;
  ready: number;
  finalized: number;
  overdue: number;
  urgent: number;
  monthRevenue: number;
  monthProfit: number;
  avgTicket: number;
  avgDaysOpen: number;
  byStatus: { status: OSStatus; count: number }[];
  byPriority: { priority: OSPriority; count: number }[];
}

export function buildOSReport(orders: ServiceOrder[], now: Date): OSReport {
  const open = orders.filter((o) => o.status !== FINALIZED);
  const ready = orders.filter((o) => o.status === READY);
  const finalized = orders.filter((o) => o.status === FINALIZED);
  const monthDone = finalized.filter((o) => o.completedAt && sameMonth(new Date(o.completedAt), now));

  const monthRevenue = monthDone.reduce((s, o) => s + o.chargedAmount, 0);
  const monthProfit = monthDone.reduce((s, o) => s + osProfit(o), 0);
  const avgTicket = monthDone.length ? monthRevenue / monthDone.length : 0;
  const avgDaysOpen = open.length
    ? open.reduce((s, o) => s + daysInLab(o, now), 0) / open.length
    : 0;

  return {
    total: orders.length,
    open: open.length,
    ready: ready.length,
    finalized: finalized.length,
    overdue: orders.filter((o) => isOverdue(o, now)).length,
    urgent: open.filter((o) => o.priority !== "Normal").length,
    monthRevenue,
    monthProfit,
    avgTicket,
    avgDaysOpen,
    byStatus: OS_STATUSES.map((status) => ({ status, count: orders.filter((o) => o.status === status).length })),
    byPriority: OS_PRIORITIES.map((priority) => ({ priority, count: orders.filter((o) => o.priority === priority).length })),
  };
}
