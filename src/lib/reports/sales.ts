import type { Accessory, Device, Sale } from "@/types/inventory";
import { buildAccessoryMap, buildDeviceMap, saleNetProfit } from "@/lib/profit";
import { saleCogs } from "@/lib/profit";
import { saleItemsSummary } from "@/lib/sales";
import { paymentLabel } from "@/lib/reconciliation";
import type { BuildOptions, Cell, DateRange, ReportResult } from "./types";
import { finalize, fmtMoney, inRange, money2, periodText, shortId, summaryItem } from "./format";

export interface SalesFilters extends DateRange {
  seller: string; // "" = todos
  method: string; // forma de pagamento; "" = todas
  origin: string; // "Balcão" | "Orçamento" | ""
  status: "todas" | "concluidas" | "devolvidas";
}

export const DEFAULT_SALES_FILTERS: SalesFilters = { seller: "", method: "", origin: "", status: "concluidas" };

export function buildSalesReport(sales: Sale[], devices: Device[], accessories: Accessory[], f: SalesFilters, opts: BuildOptions): ReportResult {
  const dm = buildDeviceMap(devices);
  const am = buildAccessoryMap(accessories);

  const list = sales
    .filter((s) => inRange(s.createdAt, f.from, f.to))
    .filter((s) => !f.seller || (s.seller || "") === f.seller)
    .filter((s) => !f.method || s.payments.some((p) => p.method === f.method))
    .filter((s) => !f.origin || (s.origin ?? "Balcão") === f.origin)
    .filter((s) => (f.status === "todas" ? true : f.status === "devolvidas" ? !!s.returnedAt : !s.returnedAt))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let total = 0, cost = 0, profit = 0, done = 0, returned = 0;
  const rows: Cell[][] = list.map((s) => {
    const isReturned = !!s.returnedAt;
    const c = saleCogs(s, dm, am);
    const p = saleNetProfit(s, dm, am);
    if (isReturned) returned++;
    else {
      done++;
      total += s.total;
      cost += c;
      profit += p;
    }
    return [
      new Date(s.createdAt),
      shortId(s.id),
      s.customer?.name ?? "—",
      s.seller || "",
      s.origin ?? "Balcão",
      [...new Set(s.payments.map((p2) => paymentLabel(p2.method, p2.installments)))].join(", ") || "—",
      saleItemsSummary(s),
      isReturned ? "Devolvida" : "Concluída",
      s.total,
      isReturned ? null : c,
      isReturned ? null : p,
    ];
  });

  const filters = [
    periodText(f.from, f.to),
    `Situação: ${f.status === "todas" ? "todas" : f.status === "devolvidas" ? "devolvidas" : "concluídas"}`,
  ];
  if (f.seller) filters.push(`Vendedor: ${f.seller}`);
  if (f.method) filters.push(`Forma de pagamento: ${f.method}`);
  if (f.origin) filters.push(`Origem: ${f.origin}`);

  return finalize({
    id: "vendas",
    title: "Relatório de Vendas",
    filters,
    columns: [
      { key: "data", label: "Data", format: "datetime" },
      { key: "venda", label: "Venda" },
      { key: "cliente", label: "Cliente" },
      { key: "vendedor", label: "Vendedor" },
      { key: "origem", label: "Origem" },
      { key: "pagamento", label: "Pagamento" },
      { key: "itens", label: "Itens" },
      { key: "situacao", label: "Situação" },
      { key: "total", label: "Total", format: "money", align: "right" },
      { key: "custo", label: "Custo", format: "money", align: "right", cost: true },
      { key: "lucro", label: "Lucro", format: "money", align: "right", cost: true },
    ],
    rows,
    totals: [`TOTAL (${done} vendas)`, "", "", "", "", "", "", "", money2(total), money2(cost), money2(profit)],
    summary: [
      summaryItem("Vendas concluídas", String(done)),
      summaryItem("Faturamento", fmtMoney(money2(total))),
      summaryItem("Ticket médio", fmtMoney(done > 0 ? money2(total / done) : 0)),
      ...(returned > 0 ? [summaryItem("Devolvidas (fora dos totais)", String(returned))] : []),
      summaryItem("Lucro", fmtMoney(money2(profit)), true),
    ],
    hasCost: true,
  }, opts.canSeeCost);
}
