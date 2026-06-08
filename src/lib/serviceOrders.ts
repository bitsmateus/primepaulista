import { ServiceOrder, OSStatus, OSPriority } from "@/types/serviceOrder";
import { onlyDigits } from "@/lib/customers";

export const OS_STATUSES: OSStatus[] = [
  "Aguardando Diagnóstico",
  "Aguardando Peça",
  "Em Reparo",
  "Pronto para Retirada",
  "Entregue / Finalizado",
];

export const OS_PRIORITIES: OSPriority[] = ["Normal", "Urgente", "Crítico"];

export const FINALIZED: OSStatus = "Entregue / Finalizado";
export const READY: OSStatus = "Pronto para Retirada";

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
