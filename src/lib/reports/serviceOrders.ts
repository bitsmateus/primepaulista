import type { ServiceOrder } from "@/types/serviceOrder";
import { effectiveCharged } from "@/lib/serviceOrders";
import type { BuildOptions, Cell, DateRange, ReportResult } from "./types";
import { finalize, fmtMoney, inRange, money2, periodText, shortId, summaryItem } from "./format";

export interface OSReportFilters extends DateRange {
  status: string; // "" = todos
  responsibility: string; // quem paga; "" = todos
  origin: string; // "" = todas
}

export const DEFAULT_OS_REPORT_FILTERS: OSReportFilters = { status: "", responsibility: "", origin: "" };

export function buildOSReport(orders: ServiceOrder[], f: OSReportFilters, opts: BuildOptions): ReportResult {
  const list = orders
    .filter((o) => inRange(o.createdAt, f.from, f.to))
    .filter((o) => !f.status || o.status === f.status)
    .filter((o) => !f.responsibility || o.costResponsibility === f.responsibility)
    .filter((o) => !f.origin || o.origin === f.origin)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let charged = 0, cost = 0, profit = 0;
  const rows: Cell[][] = list.map((o) => {
    const c = effectiveCharged(o);
    const partCost = o.partCost + o.laborCost;
    const p = c - o.partCost - o.taxes;
    charged += c;
    cost += partCost;
    profit += p;
    return [
      shortId(o.id),
      new Date(o.createdAt),
      o.customerName || "Estoque da loja",
      o.model,
      o.origin,
      o.status,
      o.costResponsibility,
      c,
      partCost,
      p,
    ];
  });

  const filters = [periodText(f.from, f.to)];
  if (f.status) filters.push(`Status: ${f.status}`);
  if (f.responsibility) filters.push(`Quem paga: ${f.responsibility}`);
  if (f.origin) filters.push(`Origem: ${f.origin}`);

  return finalize({
    id: "os",
    title: "Relatório de Ordens de Serviço",
    filters,
    columns: [
      { key: "os", label: "OS" },
      { key: "entrada", label: "Entrada", format: "date" },
      { key: "cliente", label: "Cliente" },
      { key: "aparelho", label: "Aparelho" },
      { key: "origem", label: "Origem" },
      { key: "status", label: "Status" },
      { key: "quemPaga", label: "Quem paga" },
      { key: "cobrado", label: "Valor cobrado", format: "money", align: "right" },
      { key: "custo", label: "Custo (peça + mão de obra)", format: "money", align: "right", cost: true },
      { key: "lucro", label: "Lucro", format: "money", align: "right", cost: true },
    ],
    rows,
    totals: [`TOTAL (${rows.length} OS)`, null, "", "", "", "", "", money2(charged), money2(cost), money2(profit)],
    summary: [
      summaryItem("Ordens de serviço", String(rows.length)),
      summaryItem("Total cobrado", fmtMoney(money2(charged))),
      summaryItem("Custo", fmtMoney(money2(cost)), true),
      summaryItem("Lucro", fmtMoney(money2(profit)), true),
    ],
    hasCost: true,
  }, opts.canSeeCost);
}
