import type { Sale } from "@/types/inventory";
import { buildWarrantyRecords } from "@/lib/warranty";
import { formatPhone } from "@/lib/customers";
import type { BuildOptions, Cell, ReportResult } from "./types";
import { finalize, summaryItem } from "./format";

export interface WarrantyReportFilters {
  mode: "vencendo" | "vigentes" | "vencidas";
  days: number; // "vencendo em N dias"
}

export const DEFAULT_WARRANTY_REPORT_FILTERS: WarrantyReportFilters = { mode: "vencendo", days: 30 };

// Garantias: vencendo em N dias, vigentes ou vencidas. Vendas devolvidas e itens sem garantia ficam de fora.
export function buildWarrantyReport(sales: Sale[], f: WarrantyReportFilters, opts: BuildOptions): ReportResult {
  const now = opts.now ?? new Date();
  const records = buildWarrantyRecords(sales.filter((s) => !s.returnedAt), now).filter((r) => r.days > 0);
  const days = Math.max(0, Math.round(f.days || 0));
  const list = records
    .filter((r) => (f.mode === "vencendo" ? r.active && r.daysLeft <= days : f.mode === "vigentes" ? r.active : !r.active))
    .sort((a, b) => a.until.getTime() - b.until.getTime());

  const rows: Cell[][] = list.map((r) => [
    r.customerName,
    r.customerPhone ? formatPhone(r.customerPhone) : "",
    r.model,
    r.serial,
    r.saleDate,
    r.until,
    r.active ? r.daysLeft : null,
    r.active ? "Vigente" : "Vencida",
  ]);

  return finalize({
    id: "garantias",
    title: "Relatório de Garantias",
    filters: [f.mode === "vencendo" ? `Vencendo nos próximos ${days} dias` : f.mode === "vigentes" ? "Garantias vigentes" : "Garantias vencidas"],
    columns: [
      { key: "cliente", label: "Cliente" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "produto", label: "Produto" },
      { key: "serial", label: "IMEI / Série" },
      { key: "venda", label: "Venda em", format: "date" },
      { key: "ate", label: "Garantia até", format: "date" },
      { key: "restantes", label: "Dias restantes", format: "int", align: "right" },
      { key: "situacao", label: "Situação" },
    ],
    rows,
    totals: [`TOTAL (${rows.length} garantias)`, "", "", "", null, null, null, ""],
    summary: [summaryItem("Garantias listadas", String(rows.length))],
    hasCost: false,
  }, opts.canSeeCost);
}
