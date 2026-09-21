import type { Cell, ColFormat, ReportColumn, ReportResult, ReportSummaryItem } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export const fmtDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
export const fmtDateTime = (d: Date) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

// R$ 1.234,56 (espaço comum, sem NBSP, para não sujar CSV/PDF)
export function fmtMoney(v: number): string {
  const neg = v < 0 && Math.abs(v) >= 0.005;
  const [int, dec] = Math.abs(v).toFixed(2).split(".");
  return `${neg ? "-" : ""}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

export const fmtPercent = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

export function formatCell(cell: Cell, format: ColFormat = "text"): string {
  if (cell === null || cell === undefined || cell === "") return "";
  if (cell instanceof Date) return format === "date" ? fmtDate(cell) : fmtDateTime(cell);
  if (typeof cell === "number") {
    if (format === "money") return fmtMoney(cell);
    if (format === "percent") return fmtPercent(cell);
    if (format === "int") return String(Math.round(cell));
    return String(cell);
  }
  return cell;
}

// Tabela de textos prontos (PDF e CSV): cabeçalho, linhas e totais
export function toTextTable(r: ReportResult): { head: string[]; body: string[][]; foot: string[] | null } {
  const fmt = (row: Cell[]) => row.map((c, i) => formatCell(c, r.columns[i]?.format));
  return { head: r.columns.map((c) => c.label), body: r.rows.map(fmt), foot: r.totals ? fmt(r.totals) : null };
}

export type ExcelValue = Cell | { value: Cell; format?: string; fontWeight?: "bold" };

// Linhas para o Excel: números e datas nativos; a linha de totais vai no fim (após uma linha em branco)
export function toExcelData(r: ReportResult): { header: string[]; rows: ExcelValue[][] } {
  const cell = (c: Cell, col: ReportColumn | undefined, bold = false): ExcelValue => {
    if (c === null || c === undefined || c === "") return bold ? { value: "", fontWeight: "bold" } : null;
    let format: string | undefined;
    if (typeof c === "number") {
      if (col?.format === "money") format = "#,##0.00";
      else if (col?.format === "percent") format = "0.0";
      else if (col?.format === "int") format = "0";
    }
    if (c instanceof Date && col?.format !== "date") format = "dd/mm/yyyy hh:mm";
    if (!format && !bold) return c;
    return { value: c, ...(format ? { format } : {}), ...(bold ? { fontWeight: "bold" as const } : {}) };
  };
  const rows = r.rows.map((row) => row.map((c, i) => cell(c, r.columns[i])));
  if (r.totals) {
    rows.push(r.columns.map(() => null));
    rows.push(r.totals.map((c, i) => cell(c, r.columns[i], true)));
  }
  return { header: r.columns.map((c) => c.label), rows };
}

// Remove tudo que é custo/lucro/margem (colunas, células, totais e resumos) de um relatório montado
export function stripCost(r: ReportResult): ReportResult {
  const keep = r.columns.map((c) => !c.cost);
  const pick = <T,>(arr: T[]) => arr.filter((_, i) => keep[i]);
  return {
    ...r,
    columns: pick(r.columns),
    rows: r.rows.map((row) => pick(row)),
    totals: r.totals ? pick(r.totals) : null,
    summary: r.summary.filter((s) => !s.cost),
    hasCost: false,
  };
}

// Aplica a regra de custo: sem permissão, o relatório sai SEM nenhuma informação de custo
export function finalize(r: ReportResult, canSeeCost: boolean): ReportResult {
  return canSeeCost ? r : stripCost(r);
}

export const summaryItem = (label: string, value: string, cost = false): ReportSummaryItem => ({ label, value, ...(cost ? { cost } : {}) });

// ---- período ----
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
export function inRange(date: Date | null | undefined, from?: Date, to?: Date): boolean {
  if (!from && !to) return true;
  if (!date) return false;
  const t = new Date(date).getTime();
  if (from && t < startOfDay(from).getTime()) return false;
  if (to && t > endOfDay(to).getTime()) return false;
  return true;
}
export function periodText(from?: Date, to?: Date): string {
  if (from && to) return `Período: ${fmtDate(from)} a ${fmtDate(to)}`;
  if (from) return `Período: a partir de ${fmtDate(from)}`;
  if (to) return `Período: até ${fmtDate(to)}`;
  return "Período: todos";
}
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();
export const money2 = (v: number) => Math.round(v * 100) / 100;
