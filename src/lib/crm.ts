import { Lead, FunnelColumn } from "@/types/crm";
import { Customer, Sale } from "@/types/inventory";
import { onlyDigits } from "@/lib/customers";

// Máscara progressiva de telefone enquanto digita: (11) 99999-9999
export function formatPhoneInput(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Busca de lead por nome, telefone (ignora formatação) ou modelo
export function leadMatchesSearch(lead: Lead, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = onlyDigits(q);
  if (lead.name.toLowerCase().includes(q)) return true;
  if (lead.modelInterest.toLowerCase().includes(q)) return true;
  if (qDigits && onlyDigits(lead.phone).includes(qDigits)) return true;
  return false;
}

// Substitui {nome} pelo primeiro nome do destinatário
export function personalizeMessage(template: string, fullName: string): string {
  const first = (fullName || "").trim().split(/\s+/)[0] || "";
  return template.replace(/\{nome\}/g, first);
}

export interface Recipient {
  id: string;
  name: string;
  phone: string;
  model: string;
  origin: string;
  source: "lead" | "customer";
}

// Combina leads + clientes como destinatários, deduplicando por telefone.
// Quando há duplicata, o lead tem prioridade (carrega modelo de interesse).
export function buildRecipients(leads: Lead[], customers: Customer[]): Recipient[] {
  const out: Recipient[] = [];
  const seen = new Set<string>();
  const push = (r: Recipient) => {
    const key = onlyDigits(r.phone);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    out.push(r);
  };
  for (const l of leads)
    push({ id: l.id, name: l.name, phone: l.phone, model: l.modelInterest, origin: l.origin, source: "lead" });
  for (const c of customers)
    push({ id: c.id, name: c.name, phone: c.whatsapp, model: "", origin: c.leadOrigin, source: "customer" });
  return out;
}

// Filtra destinatários por modelo e origem.
// Modelo só se aplica a quem tem modelo (clientes sem modelo não são filtrados por modelo).
export function filterRecipients(
  recipients: Recipient[],
  filters: { model?: string; origin?: string }
): Recipient[] {
  const model = filters.model && filters.model !== "all" ? filters.model.toLowerCase() : null;
  const origin = filters.origin && filters.origin !== "all" ? filters.origin : null;
  return recipients.filter((r) => {
    if (model && r.model && !r.model.toLowerCase().includes(model)) return false;
    if (model && !r.model) return false; // sem modelo não casa um filtro de modelo
    if (origin && r.origin !== origin) return false;
    return true;
  });
}

export interface FunnelSummary {
  total: number;
  byColumn: { name: string; color: string; count: number }[];
  converted: number;
  conversionRate: number; // 0..1
}

// Resumo do funil: total, contagem por coluna e taxa de conversão.
// "Convertido" = leads em colunas cujo nome casa /convert/i.
export function buildFunnelSummary(leads: Lead[], columns: FunnelColumn[]): FunnelSummary {
  const byColumn = columns.map((c) => ({
    name: c.name,
    color: c.color,
    count: leads.filter((l) => l.status === c.name).length,
  }));
  const convertedNames = new Set(
    columns.filter((c) => /convert/i.test(c.name)).map((c) => c.name)
  );
  const converted = leads.filter((l) => convertedNames.has(l.status)).length;
  const total = leads.length;
  return { total, byColumn, converted, conversionRate: total ? converted / total : 0 };
}

// Um lead "comprou" se existe venda cujo cliente tem o mesmo telefone.
export function leadHasPurchased(lead: Lead, sales: Sale[]): boolean {
  const phone = onlyDigits(lead.phone);
  if (!phone) return false;
  return sales.some((s) => onlyDigits(s.customer?.whatsapp || "") === phone);
}
