import { Customer, Sale } from "@/types/inventory";

export const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");

// Validação de CPF (algoritmo dos dígitos verificadores)
export function isValidCpf(cpf: string): boolean {
  const c = onlyDigits(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = (slice: number) => {
    let sum = 0;
    for (let i = 0; i < slice; i++) sum += Number(c[i]) * (slice + 1 - i);
    const d = (sum * 10) % 11;
    return d === 10 ? 0 : d;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

export function formatCpf(cpf: string): string {
  const c = onlyDigits(cpf);
  if (c.length !== 11) return cpf;
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}

export function formatPhone(phone: string): string {
  const p = onlyDigits(phone);
  if (p.length === 11) return `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}`;
  return phone;
}

// Busca por nome (texto) ou CPF/telefone (ignorando formatação)
export function customerMatchesSearch(c: Customer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = onlyDigits(q);
  if (c.name.toLowerCase().includes(q)) return true;
  if (qDigits && (onlyDigits(c.cpf).includes(qDigits) || onlyDigits(c.whatsapp).includes(qDigits)))
    return true;
  return false;
}

export interface CustomerStat {
  count: number;
  total: number;
  lastAt: Date | null;
}

// Estatísticas de compra por cliente (a partir das vendas)
export function buildCustomerStats(sales: Sale[]): Record<string, CustomerStat> {
  const map: Record<string, CustomerStat> = {};
  for (const s of sales) {
    const id = s.customer?.id;
    if (!id) continue;
    const cur = map[id] || { count: 0, total: 0, lastAt: null };
    cur.count += 1;
    cur.total += s.total;
    const d = new Date(s.createdAt);
    if (!cur.lastAt || d > cur.lastAt) cur.lastAt = d;
    map[id] = cur;
  }
  return map;
}

// Mês do aniversário (1-12) a partir de "YYYY-MM-DD", "dd/mm" ou "dd/mm/yyyy"
export function birthdayMonth(birthday: string): number | null {
  if (!birthday) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(birthday)) return Number(birthday.slice(5, 7));
  const parts = birthday.split("/");
  if (parts.length >= 2) {
    const m = Number(parts[1]);
    return m >= 1 && m <= 12 ? m : null;
  }
  return null;
}

export function formatBirthday(birthday: string): string {
  if (!birthday) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(birthday)) return `${birthday.slice(8, 10)}/${birthday.slice(5, 7)}`;
  return birthday;
}

export interface CustomerReport {
  total: number;
  buyers: number;
  newThisMonth: number;
  byOrigin: Record<string, number>;
}

export function buildCustomerReport(
  customers: Customer[],
  stats: Record<string, CustomerStat>,
  now: Date
): CustomerReport {
  const byOrigin: Record<string, number> = {};
  let newThisMonth = 0;
  let buyers = 0;
  for (const c of customers) {
    const o = c.leadOrigin || "—";
    byOrigin[o] = (byOrigin[o] || 0) + 1;
    const created = new Date(c.createdAt);
    if (created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear())
      newThisMonth++;
    if (stats[c.id]?.count) buyers++;
  }
  return { total: customers.length, buyers, newThisMonth, byOrigin };
}
