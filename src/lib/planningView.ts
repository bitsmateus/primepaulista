import { addDays, weekStartOf } from "@/lib/planning";

// Regras da tela de Planejamento (só front): semana atual, rótulos, resumo e agrupamento.

export interface PlanningTask {
  id: string;
  weekStart: string;
  weekday: number;
  title: string;
  description: string;
  assigneeId: string | null;
  assigneeName: string;
  done: boolean;
  doneAt: Date | null;
  remindAt: Date | null;
  remindedAt: Date | null;
  reminderMessage: string;
  whatsappStatus: "sent" | "failed" | "no_phone" | "no_instance" | null;
  whatsappError: string | null;
  whatsappAt: Date | null;
  createdByName: string;
  createdAt: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Segunda-feira da semana que contém a data (horário local do navegador)
export function currentWeekStart(now: Date = new Date()): string {
  return weekStartOf(toYmd(now));
}

export const shiftWeek = (weekStart: string, weeks: number) => addDays(weekStart, weeks * 7);

// As 7 datas (seg -> dom) da semana
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

const SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const weekdayShort = (weekday: number) => SHORT[weekday] ?? "";

// "22/09" (dia/mês de uma data YYYY-MM-DD)
export const dayMonth = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

// "22/09 a 28/09/2026" — na virada de ano mostra os dois anos: "29/12/2025 a 04/01/2026"
export function weekRangeLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  if (weekStart.slice(0, 4) !== end.slice(0, 4)) {
    return `${dayMonth(weekStart)}/${weekStart.slice(0, 4)} a ${dayMonth(end)}/${end.slice(0, 4)}`;
  }
  return `${dayMonth(weekStart)} a ${dayMonth(end)}/${end.slice(0, 4)}`;
}

export interface WeekSummary {
  total: number;
  done: number;
  percent: number;
}

export function weekSummary(tasks: Pick<PlanningTask, "done">[]): WeekSummary {
  const done = tasks.filter((t) => t.done).length;
  return { total: tasks.length, done, percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

// Tarefas por dia da semana (0 = segunda ... 6 = domingo), mantendo a ordem recebida
export function groupByWeekday<T extends Pick<PlanningTask, "weekday">>(tasks: T[]): T[][] {
  const cols: T[][] = Array.from({ length: 7 }, () => []);
  for (const t of tasks) if (t.weekday >= 0 && t.weekday <= 6) cols[t.weekday].push(t);
  return cols;
}

export const onlyMine = <T extends Pick<PlanningTask, "assigneeId">>(tasks: T[], userId: string | undefined): T[] =>
  tasks.filter((t) => !!userId && t.assigneeId === userId);

// Valor para <input type="datetime-local"> (horário local) a partir de uma data
export function toLocalInput(d: Date | null | undefined): string {
  if (!d) return "";
  return `${toYmd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Do <input type="datetime-local"> para ISO (com fuso); vazio/ inválido = null
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Estado do lembrete para exibir no cartão
export function reminderLabel(t: Pick<PlanningTask, "remindAt" | "whatsappStatus" | "remindedAt">, now: Date = new Date()): string | null {
  if (!t.remindAt) return null;
  const when = `${pad(t.remindAt.getDate())}/${pad(t.remindAt.getMonth() + 1)} ${pad(t.remindAt.getHours())}:${pad(t.remindAt.getMinutes())}`;
  if (t.remindAt.getTime() > now.getTime()) return `Lembrete em ${when}`;
  if (t.whatsappStatus === "sent") return `Lembrado por WhatsApp (${when})`;
  if (t.whatsappStatus === "failed") return "WhatsApp falhou";
  if (t.whatsappStatus === "no_phone") return "Sem WhatsApp cadastrado";
  if (t.whatsappStatus === "no_instance") return "WhatsApp indisponível";
  return `Lembrete de ${when}`;
}
