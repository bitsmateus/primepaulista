// Agenda de follow-up do CRM (Fase 5A): monta a lista de tarefas de leads + sugestões automáticas de
// contato com CLIENTES (aniversariantes, pós-compra, orçamento sem resposta, garantia vencendo).
// Lógica PURA e testada com datas fixas; todas as datas são "dia no fuso America/Sao_Paulo".
import type { Customer, Sale } from "@/types/inventory";
import type { Lead, LeadTask, MessageLog } from "@/types/crm";
import type { Quote } from "@/types/quote";
import { samePhone, phoneKey, firstName } from "@/lib/crmText";
import { zonedParts } from "@/lib/keywordRules";

export interface AgendaConfig {
  purchaseDays: number; // cliente com compra há >= N dias e sem contato
  quoteDays: number; // orçamento enviado sem resposta há >= N dias
  warrantyDays: number; // garantia vencendo nos próximos N dias
  purchaseMaxDays: number; // não sugerir contato para compras mais antigas que isso
}
export const DEFAULT_AGENDA_CONFIG: AgendaConfig = { purchaseDays: 30, quoteDays: 3, warrantyDays: 15, purchaseMaxDays: 365 };

export type AgendaKind = "task" | "birthday" | "purchase" | "quote" | "warranty";
export type AgendaGroupKey = "overdue" | "today" | "next7" | "later" | "nodate";

export const AGENDA_GROUP_LABELS: Record<AgendaGroupKey, string> = {
  overdue: "Atrasados",
  today: "Hoje",
  next7: "Próximos 7 dias",
  later: "Depois",
  nodate: "Sem data",
};
export const AGENDA_GROUP_ORDER: AgendaGroupKey[] = ["overdue", "today", "next7", "later", "nodate"];

export interface AgendaItem {
  key: string; // estável (tarefa: task:<id>; sugestão: <tipo>:<ids>) — vira sourceKey da tarefa criada
  kind: AgendaKind;
  title: string;
  detail: string;
  date: string | null; // YYYY-MM-DD (dia em São Paulo); null = sem data
  done: boolean;
  name: string;
  phone: string;
  message: string; // texto sugerido para o WhatsApp
  stage?: string; // etapa do funil sugerida se a sugestão virar lead
  leadId?: string;
  taskId?: string;
  customerId?: string;
  ownerId?: string;
  ownerName?: string;
}

// ---- datas (dia em São Paulo) ----
export const spDate = (d: Date): string => zonedParts(d).date;

function parseYmd(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
const ymdOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const addDaysYmd = (s: string, n: number): string => ymdOf(parseYmd(s) + n * 86_400_000);
// dias inteiros de a até b (b - a)
export const diffDays = (a: string, b: string): number => Math.round((parseYmd(b) - parseYmd(a)) / 86_400_000);
export const brDate = (ymd: string): string => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
export const brDay = (ymd: string): string => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// "YYYY-MM-DD..." ou "dd/mm/yyyy" -> { m, d } | null
function birthdayParts(b: string): { m: number; d: number } | null {
  if (!b) return null;
  let m: number, d: number;
  if (/^\d{4}-\d{2}-\d{2}/.test(b)) {
    m = Number(b.slice(5, 7));
    d = Number(b.slice(8, 10));
  } else {
    const p = b.split("/");
    if (p.length < 2) return null;
    d = Number(p[0]);
    m = Number(p[1]);
  }
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return { m, d };
}

// Próxima ocorrência (hoje ou depois) do aniversário; 29/02 cai em 28/02 nos anos comuns
export function nextBirthday(b: string, today: string): string | null {
  const p = birthdayParts(b);
  if (!p) return null;
  const y0 = Number(today.slice(0, 4));
  for (const y of [y0, y0 + 1]) {
    const day = p.m === 2 && p.d === 29 && !isLeap(y) ? 28 : p.d;
    const cand = `${y}-${String(p.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (cand >= today) return cand;
  }
  return null;
}

// Data de agendamento (12:00 de São Paulo) no formato ISO com fuso, para gravar como vencimento da tarefa
export const dueIso = (ymd: string): string => `${ymd}T12:00:00-03:00`;

export function rescheduleDate(kind: "today" | "tomorrow" | "week", now: Date): string {
  const today = spDate(now);
  return kind === "today" ? today : addDaysYmd(today, kind === "tomorrow" ? 1 : 7);
}

// ---- montagem ----
export interface AgendaInput {
  now: Date;
  config: AgendaConfig;
  tasks: LeadTask[];
  leads: Lead[];
  customers: Customer[];
  sales: Sale[];
  quotes: Quote[];
  messageLogs: Pick<MessageLog, "recipientId" | "recipientPhone" | "sentAt">[];
  storeName: string;
}

export function buildAgenda(input: AgendaInput): AgendaItem[] {
  const { now, config, tasks, leads, customers, sales, quotes, messageLogs, storeName } = input;
  const today = spDate(now);
  const items: AgendaItem[] = [];
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const leadByPhone = (phone: string) => (phoneKey(phone).length >= 10 ? leads.find((l) => samePhone(l.phone, phone)) : undefined);

  // ---- tarefas de leads ----
  for (const t of tasks) {
    const lead = leadById.get(t.leadId);
    items.push({
      key: `task:${t.id}`,
      kind: "task",
      title: t.title,
      detail: lead ? `Lead: ${lead.name}` : "Lead",
      date: t.dueDate ? spDate(new Date(t.dueDate)) : null,
      done: t.done,
      name: lead?.name ?? "",
      phone: lead?.phone ?? "",
      message: lead ? `Olá, ${firstName(lead.name)}! Tudo bem? Aqui é da ${storeName}.` : "",
      leadId: t.leadId,
      taskId: t.id,
      ownerId: lead?.ownerId,
      ownerName: lead?.ownerName,
    });
  }

  // Sugestões já viradas em tarefa (feita ou não) não aparecem de novo
  const usedKeys = new Set(tasks.map((t) => t.sourceKey).filter((k): k is string => Boolean(k)));
  const contactedAfter = (phone: string, since: Date) =>
    messageLogs.some((m) => samePhone(m.recipientPhone, phone) && new Date(m.sentAt).getTime() > since.getTime());
  const ownerFor = (phone: string, fallbackName?: string) => {
    const l = leadByPhone(phone);
    return { ownerId: l?.ownerId, ownerName: l?.ownerName || fallbackName || undefined, leadId: l?.id };
  };
  const push = (it: AgendaItem) => {
    if (!usedKeys.has(it.key)) items.push(it);
  };

  // ---- aniversariantes da semana (hoje até +6 dias) ----
  for (const c of customers) {
    const next = nextBirthday(c.birthday, today);
    if (!next || diffDays(today, next) > 6) continue;
    push({
      key: `birthday:${c.id}:${next.slice(0, 4)}`,
      kind: "birthday",
      title: `Aniversário de ${c.name}`,
      detail: next === today ? "Faz aniversário hoje" : `Faz aniversário em ${brDay(next)}`,
      date: next,
      done: false,
      name: c.name,
      phone: c.whatsapp,
      message: `Feliz aniversário, ${firstName(c.name)}! 🎉 A ${storeName} deseja um dia muito especial para você!`,
      stage: "Pós-venda",
      customerId: c.id,
      ...ownerFor(c.whatsapp),
    });
  }

  // vendas válidas (não devolvidas)
  const validSales = sales.filter((s) => !s.returnedAt);

  // ---- clientes com compra há N dias e sem contato (uma sugestão por cliente: a última compra) ----
  const lastByCustomer = new Map<string, Sale>();
  for (const s of validSales) {
    if (!s.customer.id) continue; // venda sem cliente cadastrado
    const cur = lastByCustomer.get(s.customer.id);
    if (!cur || new Date(s.createdAt).getTime() > new Date(cur.createdAt).getTime()) lastByCustomer.set(s.customer.id, s);
  }
  for (const s of lastByCustomer.values()) {
    const saleDay = spDate(new Date(s.createdAt));
    const days = diffDays(saleDay, today);
    if (days < config.purchaseDays || days > config.purchaseMaxDays) continue;
    const phone = s.customer.whatsapp;
    if (phone && contactedAfter(phone, new Date(s.createdAt))) continue;
    const model = s.items[0]?.name ?? "aparelho";
    push({
      key: `purchase:${s.customer.id}:${s.id}`,
      kind: "purchase",
      title: `Follow-up de pós-venda: ${s.customer.name}`,
      detail: `Última compra há ${days} dias (${brDate(saleDay)}) · ${model}`,
      date: today,
      done: false,
      name: s.customer.name,
      phone,
      message: `Olá, ${firstName(s.customer.name)}! Tudo bem? Aqui é da ${storeName}. Passando para saber como está o seu ${model}. Precisando de algo, é só chamar!`,
      stage: "Pós-venda",
      customerId: s.customer.id,
      ...ownerFor(phone, s.seller),
    });
  }

  // ---- orçamentos enviados sem resposta há N dias ----
  for (const q of quotes) {
    if (q.status !== "Enviado") continue;
    const sentDay = spDate(new Date(q.updatedAt));
    const days = diffDays(sentDay, today);
    if (days < config.quoteDays) continue;
    if (q.customerPhone && contactedAfter(q.customerPhone, new Date(q.updatedAt))) continue;
    push({
      key: `quote:${q.id}`,
      kind: "quote",
      title: `Orçamento nº ${q.number} sem resposta: ${q.customerName}`,
      detail: `Enviado há ${days} dias · ${q.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      date: today,
      done: false,
      name: q.customerName,
      phone: q.customerPhone,
      message: `Olá, ${firstName(q.customerName)}! Conseguiu avaliar o orçamento nº ${q.number}? Fico à disposição para tirar qualquer dúvida. — ${storeName}`,
      stage: "Orçamento Enviado",
      customerId: q.customerId,
      ...ownerFor(q.customerPhone, q.sellerName),
    });
  }

  // ---- garantia vencendo nos próximos N dias ----
  for (const s of validSales) {
    const saleDay = spDate(new Date(s.createdAt));
    for (const it of s.items) {
      const wd = it.warrantyDays ?? 0;
      if (wd <= 0) continue;
      const expiry = addDaysYmd(saleDay, wd);
      const left = diffDays(today, expiry);
      if (left < 0 || left > config.warrantyDays) continue;
      const phone = s.customer.whatsapp;
      push({
        key: `warranty:${s.id}:${it.id}`,
        kind: "warranty",
        title: `Garantia vencendo: ${it.name}`,
        detail: `${s.customer.name} · vence em ${brDate(expiry)} (${left === 0 ? "hoje" : `em ${left} dia${left === 1 ? "" : "s"}`})`,
        date: expiry,
        done: false,
        name: s.customer.name,
        phone,
        message: `Olá, ${firstName(s.customer.name)}! A garantia do seu ${it.name} vence em ${brDate(expiry)}. Se precisar de uma revisão, é só falar com a gente. — ${storeName}`,
        stage: "Pós-venda",
        customerId: s.customer.id,
        ...ownerFor(phone, s.seller),
      });
    }
  }

  return items;
}

// ---- agrupamento ----
export function groupOf(item: Pick<AgendaItem, "date">, today: string): AgendaGroupKey {
  if (!item.date) return "nodate";
  const d = diffDays(today, item.date);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "next7";
  return "later";
}

const byDateThenTitle = (a: AgendaItem, b: AgendaItem) =>
  (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.title.localeCompare(b.title, "pt-BR");

// Concluídas ficam de fora (a menos que includeDone). Sugestões nunca ficam "atrasadas" nem "concluídas".
export function groupAgenda(items: AgendaItem[], now: Date, includeDone = false): Record<AgendaGroupKey, AgendaItem[]> {
  const today = spDate(now);
  const out: Record<AgendaGroupKey, AgendaItem[]> = { overdue: [], today: [], next7: [], later: [], nodate: [] };
  for (const it of items) {
    if (it.done && !includeDone) continue;
    out[groupOf(it, today)].push(it);
  }
  for (const k of AGENDA_GROUP_ORDER) out[k].sort(byDateThenTitle);
  return out;
}

// ---- filtro por responsável ----
export type OwnerFilter = "all" | "mine" | string; // string = nome do responsável
export function filterByOwner(items: AgendaItem[], filter: OwnerFilter, me: { id?: string; name?: string }): AgendaItem[] {
  if (filter === "all") return items;
  if (filter === "mine") return items.filter((i) => (i.ownerId && i.ownerId === me.id) || (i.ownerName && i.ownerName === me.name));
  return items.filter((i) => i.ownerName === filter);
}

// ---- visão por semana (segunda a domingo) ----
export interface WeekDay {
  date: string;
  items: AgendaItem[];
}
export function weekOf(items: AgendaItem[], weekStart: string, includeDone = false): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysYmd(weekStart, i);
    return { date, items: items.filter((it) => it.date === date && (includeDone || !it.done)).sort(byDateThenTitle) };
  });
}
