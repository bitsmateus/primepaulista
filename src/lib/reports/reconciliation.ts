import { AUDIT_STATUSES, AUDIT_STATUS_LABEL, paymentLabel, type ReconciliationRow } from "@/lib/reconciliation";
import type { BuildOptions, Cell, ReportResult } from "./types";
import { finalize, fmtMoney, money2, summaryItem } from "./format";

// Conferência financeira por status. Os filtros (período, forma, status, vendedor, texto)
// são aplicados no servidor; aqui só se monta o relatório a partir das linhas recebidas.
export function buildReconciliationReport(rows: ReconciliationRow[], filters: string[], opts: BuildOptions): ReportResult {
  const by = Object.fromEntries(AUDIT_STATUSES.map((s) => [s, { n: 0, total: 0 }])) as Record<string, { n: number; total: number }>;
  let total = 0;
  const out: Cell[][] = rows.map((r) => {
    by[r.auditStatus].n++;
    by[r.auditStatus].total += r.amount;
    total += r.amount;
    return [r.createdAt, r.saleCode, r.customerName, r.sellerName, paymentLabel(r.method, r.installments), r.amount, AUDIT_STATUS_LABEL[r.auditStatus], r.auditNote, r.auditedByName, r.auditedAt];
  });

  return finalize({
    id: "conferencia",
    title: "Relatório de Conferência Financeira",
    filters: filters.length ? filters : ["Todos os pagamentos"],
    columns: [
      { key: "data", label: "Data", format: "datetime" },
      { key: "venda", label: "Venda" },
      { key: "cliente", label: "Cliente" },
      { key: "vendedor", label: "Vendedor" },
      { key: "forma", label: "Forma" },
      { key: "valor", label: "Valor", format: "money", align: "right" },
      { key: "status", label: "Status" },
      { key: "obs", label: "Observação (NSU / comprovante)" },
      { key: "por", label: "Conferido por" },
      { key: "em", label: "Conferido em", format: "datetime" },
    ],
    rows: out,
    totals: [`TOTAL (${out.length} pagamentos)`, "", "", "", "", money2(total), "", "", "", null],
    summary: AUDIT_STATUSES.map((s) => summaryItem(`${AUDIT_STATUS_LABEL[s]}`, `${by[s].n} (${fmtMoney(money2(by[s].total))})`)),
    hasCost: false,
  }, opts.canSeeCost);
}
