// Regras PURAS do planejamento semanal (semana, dia, mensagem do lembrete).
//
// ATENÇÃO: existe uma cópia idêntica no front (src/lib/planning.ts), porque a API é implantada
// separada do site. O teste src/test/planning.test.ts roda os mesmos casos nas duas cópias.

export const DEFAULT_REMINDER_TEMPLATE =
  "Olá, {nome}! Lembrete da {loja}: você tem uma tarefa para {dia}: {tarefa}";

export const WEEKDAY_NAMES = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];

const pad = (n: number) => String(n).padStart(2, "0");

// "YYYY-MM-DD" -> Date UTC (meio-dia evita virada por fuso); null se a data não existe
function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function isMonday(s: string): boolean {
  const d = parseYmd(s);
  return !!d && d.getUTCDay() === 1;
}

// Segunda-feira da semana que contém a data
export function weekStartOf(s: string): string {
  const d = parseYmd(s);
  if (!d) throw new Error("data inválida");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  d.setUTCDate(d.getUTCDate() - dow);
  return ymd(d);
}

export function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  if (!d) throw new Error("data inválida");
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

// Data (YYYY-MM-DD) do dia `weekday` (0 = segunda) da semana
export function dateOfWeekday(weekStart: string, weekday: number): string {
  return addDays(weekStart, weekday);
}

// "segunda-feira (22/09)"
export function dayLabel(weekStart: string, weekday: number): string {
  const d = dateOfWeekday(weekStart, weekday);
  return `${WEEKDAY_NAMES[weekday]} (${d.slice(8, 10)}/${d.slice(5, 7)})`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export interface ReminderVars {
  assigneeName: string;
  title: string;
  weekStart: string;
  weekday: number;
  storeName: string;
}

// Troca {nome} {tarefa} {dia} {loja}; variáveis desconhecidas ficam como estão
export function renderReminder(template: string, v: ReminderVars): string {
  const base = template.trim() ? template : DEFAULT_REMINDER_TEMPLATE;
  const map: Record<string, string> = {
    nome: firstName(v.assigneeName) || "colaborador",
    tarefa: v.title,
    dia: dayLabel(v.weekStart, v.weekday),
    loja: v.storeName,
  };
  return base.replace(/\{(nome|tarefa|dia|loja)\}/g, (_m, k: string) => map[k]);
}
