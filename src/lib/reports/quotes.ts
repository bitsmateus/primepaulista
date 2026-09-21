import type { Quote } from "@/types/quote";
import { quoteDisplayStatus } from "@/lib/quotes";
import type { BuildOptions, Cell, DateRange, ReportResult } from "./types";
import { finalize, fmtMoney, fmtPercent, inRange, money2, periodText, summaryItem } from "./format";

export interface QuoteReportFilters extends DateRange {
  status: string; // Aberto | Enviado | Aprovado | Recusado | Convertido | Expirado | "" (todos)
  seller: string;
}

export const DEFAULT_QUOTE_REPORT_FILTERS: QuoteReportFilters = { status: "", seller: "" };

export function buildQuoteReport(quotes: Quote[], f: QuoteReportFilters, opts: BuildOptions): ReportResult {
  const now = opts.now ?? new Date();
  const list = quotes
    .filter((q) => inRange(q.createdAt, f.from, f.to))
    .filter((q) => !f.seller || q.sellerName === f.seller)
    .filter((q) => !f.status || quoteDisplayStatus(q, now) === f.status)
    .sort((a, b) => a.number - b.number);

  let total = 0, converted = 0, convertedValue = 0;
  const rows: Cell[][] = list.map((q) => {
    total += q.total;
    if (q.status === "Convertido") {
      converted++;
      convertedValue += q.total;
    }
    return [q.number, new Date(q.createdAt), q.customerName, q.sellerName, q.validUntil ?? null, quoteDisplayStatus(q, now), q.items.length, q.total];
  });
  const rate = list.length > 0 ? (converted / list.length) * 100 : 0;

  const filters = [periodText(f.from, f.to)];
  if (f.status) filters.push(`Status: ${f.status}`);
  if (f.seller) filters.push(`Vendedor: ${f.seller}`);

  return finalize({
    id: "orcamentos",
    title: "Relatório de Orçamentos",
    filters,
    columns: [
      { key: "numero", label: "Nº", format: "int", align: "right" },
      { key: "data", label: "Data", format: "date" },
      { key: "cliente", label: "Cliente" },
      { key: "vendedor", label: "Vendedor" },
      { key: "validade", label: "Validade", format: "date" },
      { key: "status", label: "Status" },
      { key: "itens", label: "Itens", format: "int", align: "right" },
      { key: "total", label: "Total", format: "money", align: "right" },
    ],
    rows,
    totals: [`TOTAL (${rows.length})`, null, "", "", null, "", null, money2(total)],
    summary: [
      summaryItem("Orçamentos", String(rows.length)),
      summaryItem("Valor orçado", fmtMoney(money2(total))),
      summaryItem("Convertidos em venda", String(converted)),
      summaryItem("Valor convertido", fmtMoney(money2(convertedValue))),
      summaryItem("Taxa de conversão", fmtPercent(rate)),
    ],
    hasCost: false,
  }, opts.canSeeCost);
}
