import { can, type Capability } from "@/lib/permissions";
import type { ReportId, ReportResult } from "./types";
import { toExcelData, toTextTable } from "./format";

export type { ReportId, ReportResult } from "./types";

export interface ReportDef {
  id: ReportId;
  label: string;
  description: string;
  capability: Capability; // capacidade necessária para ver os dados deste relatório
}

// Central de Relatórios: quem tem `viewReports` entra; cada relatório exige também a capacidade dos seus dados.
export const REPORTS: ReportDef[] = [
  { id: "estoque", label: "Estoque", description: "Aparelhos e acessórios por categoria, marca, condição, local e status.", capability: "viewStock" },
  { id: "vendas", label: "Vendas", description: "Vendas por período, vendedor, forma de pagamento e origem, com ticket médio.", capability: "viewSales" },
  { id: "financeiro", label: "Financeiro", description: "Receita por forma de pagamento, despesas, sangrias, contas e resultado do período.", capability: "viewBI" },
  { id: "os", label: "Ordens de Serviço", description: "OS por período, status, quem paga e origem.", capability: "viewOS" },
  { id: "clientes", label: "Clientes", description: "Compras, última compra e aniversariantes.", capability: "viewSales" },
  { id: "orcamentos", label: "Orçamentos", description: "Orçamentos por status e taxa de conversão em venda.", capability: "viewSales" },
  { id: "garantias", label: "Garantias", description: "Garantias vencendo nos próximos dias, vigentes ou vencidas.", capability: "viewSalesData" },
  { id: "conferencia", label: "Conferência", description: "Conferência financeira dos pagamentos por status.", capability: "reconcile" },
];

export const canOpenReportCenter = (role: string | null | undefined) => can(role, "viewReports");

export function visibleReports(role: string | null | undefined): ReportDef[] {
  if (!canOpenReportCenter(role)) return [];
  return REPORTS.filter((r) => can(role, r.capability));
}

export type ExportFormat = "pdf" | "xlsx" | "csv";

// Nome do arquivo: relatorio-estoque-2026-09-21.pdf
export function reportFileName(id: ReportId, format: ExportFormat, now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `relatorio-${id}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.${format}`;
}

// Linhas do CSV: cabeçalho, dados e (no fim) a linha de totais
export function reportCsv(r: ReportResult): { header: string[]; rows: string[][] } {
  const { head, body, foot } = toTextTable(r);
  return { header: head, rows: foot ? [...body, foot] : body };
}

export { toExcelData, toTextTable };
