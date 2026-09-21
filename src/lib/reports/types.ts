// Tipos comuns dos relatórios da Central de Relatórios.
// Cada gerador de relatório é PURO: recebe dados + filtros e devolve um ReportResult.

export type Cell = string | number | Date | null;
export type ColFormat = "text" | "money" | "int" | "date" | "datetime" | "percent";

export interface ReportColumn {
  key: string;
  label: string;
  format?: ColFormat;
  align?: "left" | "right" | "center";
  cost?: boolean; // coluna de custo/lucro/margem: só sai para quem pode ver custo
}

export interface ReportSummaryItem {
  label: string;
  value: string;
  cost?: boolean;
}

export type ReportId =
  | "estoque"
  | "vendas"
  | "financeiro"
  | "os"
  | "clientes"
  | "orcamentos"
  | "garantias"
  | "conferencia";

export interface ReportResult {
  id: ReportId;
  title: string;
  filters: string[]; // descrição legível dos filtros aplicados
  columns: ReportColumn[];
  rows: Cell[][];
  totals: Cell[] | null; // alinhado às colunas (a primeira traz o rótulo TOTAL)
  summary: ReportSummaryItem[];
  hasCost: boolean; // o relatório inclui informação de custo/lucro
}

export interface BuildOptions {
  canSeeCost: boolean;
  now?: Date;
}

export interface DateRange {
  from?: Date;
  to?: Date;
}
