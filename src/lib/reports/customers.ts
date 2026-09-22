import type { Customer, Sale } from "@/types/inventory";
import { birthdayMonth, buildCustomerStats, formatBirthday, formatCpf, formatPhone } from "@/lib/customers";
import type { BuildOptions, Cell, ReportResult } from "./types";
import { finalize, fmtMoney, money2, summaryItem } from "./format";

export interface CustomerReportFilters {
  origin: string; // "" = todas
  birthdayMonth: number; // 0 = todos, 1-12
  buyers: "todos" | "comCompras" | "semCompras";
}

export const DEFAULT_CUSTOMER_REPORT_FILTERS: CustomerReportFilters = { origin: "", birthdayMonth: 0, buyers: "todos" };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Clientes: compras, última compra e aniversariantes. Devoluções não contam como compra.
export function buildCustomerReport(customers: Customer[], sales: Sale[], f: CustomerReportFilters, opts: BuildOptions): ReportResult {
  const stats = buildCustomerStats(sales.filter((s) => !s.returnedAt));
  const list = customers
    .filter((c) => !f.origin || c.leadOrigin === f.origin)
    .filter((c) => !f.birthdayMonth || birthdayMonth(c.birthday) === f.birthdayMonth)
    .filter((c) => {
      const n = stats[c.id]?.count ?? 0;
      return f.buyers === "todos" ? true : f.buyers === "comCompras" ? n > 0 : n === 0;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  let purchases = 0, total = 0;
  const rows: Cell[][] = list.map((c) => {
    const st = stats[c.id];
    purchases += st?.count ?? 0;
    total += st?.total ?? 0;
    return [c.name, c.cpf ? formatCpf(c.cpf) : "", c.whatsapp ? formatPhone(c.whatsapp) : "", c.birthday ? formatBirthday(c.birthday) : "", c.leadOrigin, st?.count ?? 0, st?.total ?? 0, st?.lastAt ?? null];
  });

  const filters: string[] = [];
  if (f.origin) filters.push(`Origem: ${f.origin}`);
  if (f.birthdayMonth) filters.push(`Aniversariantes de ${MONTHS[f.birthdayMonth - 1]}`);
  if (f.buyers !== "todos") filters.push(f.buyers === "comCompras" ? "Somente quem já comprou" : "Somente quem nunca comprou");
  if (!filters.length) filters.push("Todos os clientes");

  return finalize({
    id: "clientes",
    title: "Relatório de Clientes",
    filters,
    columns: [
      { key: "nome", label: "Cliente" },
      { key: "cpf", label: "CPF" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "aniversario", label: "Aniversário" },
      { key: "origem", label: "Origem" },
      { key: "compras", label: "Compras", format: "int", align: "right" },
      { key: "total", label: "Total comprado", format: "money", align: "right" },
      { key: "ultima", label: "Última compra", format: "date" },
    ],
    rows,
    totals: [`TOTAL (${rows.length} clientes)`, "", "", "", "", purchases, money2(total), null],
    summary: [
      summaryItem("Clientes", String(rows.length)),
      summaryItem("Compras", String(purchases)),
      summaryItem("Total comprado", fmtMoney(money2(total))),
    ],
    hasCost: false,
  }, opts.canSeeCost);
}
