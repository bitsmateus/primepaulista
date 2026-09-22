import type { Accessory, Device, Sale } from "@/types/inventory";
import type { Expense, Sangria } from "@/types/financial";
import { buildAccessoryMap, buildDeviceMap, saleCogs } from "@/lib/profit";
import type { BuildOptions, Cell, DateRange, ReportResult } from "./types";
import { finalize, fmtMoney, inRange, money2, periodText, summaryItem } from "./format";

// Só o que o relatório precisa (mantém o gerador puro e independente da API)
export interface PayableLite {
  description: string;
  category: string;
  amount: number;
  dueDate: Date | null;
  status: "pendente" | "pago" | "atrasado";
}
export interface ReceivableLite {
  customerName: string;
  amount: number;
  dueDate: Date | null;
  status: "pendente" | "pago" | "atrasado";
}

export interface FinanceData {
  sales: Sale[];
  devices: Device[];
  accessories: Accessory[];
  expenses: Expense[];
  sangrias: Sangria[];
  payables: PayableLite[];
  receivables: ReceivableLite[];
}

const STATUS_LABEL = { pendente: "pendente", pago: "pago", atrasado: "atrasado" } as const;

// Financeiro do período: receita por forma de pagamento, despesas, sangrias, contas e resultado.
// Resultado = receita (pagamentos das vendas não devolvidas) - despesas (- custo dos produtos, se puder ver custo).
// Sangrias e contas a pagar/receber aparecem como informação (não entram no resultado).
export function buildFinanceReport(d: FinanceData, f: DateRange, opts: BuildOptions): ReportResult {
  const dm = buildDeviceMap(d.devices);
  const am = buildAccessoryMap(d.accessories);
  const sales = d.sales.filter((s) => !s.returnedAt && inRange(s.createdAt, f.from, f.to));

  const byMethod = new Map<string, { n: number; total: number }>();
  for (const s of sales) {
    for (const p of s.payments) {
      const cur = byMethod.get(p.method) ?? { n: 0, total: 0 };
      cur.n += 1;
      cur.total += p.amount;
      byMethod.set(p.method, cur);
    }
  }
  const revenue = money2([...byMethod.values()].reduce((s, m) => s + m.total, 0));
  const cogs = money2(sales.reduce((s, x) => s + saleCogs(x, dm, am), 0));

  const exps = d.expenses.filter((e) => inRange(e.date, f.from, f.to));
  const expTotal = money2(exps.reduce((s, e) => s + e.amount, 0));
  const sang = d.sangrias.filter((s) => inRange(s.date, f.from, f.to));
  const sangTotal = money2(sang.reduce((s, e) => s + e.amount, 0));
  const pays = d.payables.filter((p) => inRange(p.dueDate, f.from, f.to));
  const paysOpen = money2(pays.filter((p) => p.status !== "pago").reduce((s, p) => s + p.amount, 0));
  const recs = d.receivables.filter((r) => inRange(r.dueDate, f.from, f.to));
  const recsOpen = money2(recs.filter((r) => r.status !== "pago").reduce((s, r) => s + r.amount, 0));

  const result = money2(revenue - expTotal - (opts.canSeeCost ? cogs : 0));

  const rows: Cell[][] = [];
  for (const [method, m] of [...byMethod.entries()].sort((a, b) => b[1].total - a[1].total)) {
    rows.push(["Receita por forma de pagamento", `${method} (${m.n} pagamento${m.n === 1 ? "" : "s"})`, null, money2(m.total)]);
  }
  rows.push(["Receita por forma de pagamento", "Total da receita", null, revenue]);
  if (opts.canSeeCost) rows.push(["Custo dos produtos vendidos", "(-) Custo das vendas do período", null, cogs]);
  for (const e of exps.sort((a, b) => a.date.getTime() - b.date.getTime())) {
    rows.push(["Despesas", `${e.description} (${e.category})`, e.date, e.amount]);
  }
  rows.push(["Despesas", "Total das despesas", null, expTotal]);
  for (const s of sang.sort((a, b) => a.date.getTime() - b.date.getTime())) {
    rows.push(["Sangrias (retiradas de caixa)", s.justification || "Sangria", s.date, s.amount]);
  }
  rows.push(["Sangrias (retiradas de caixa)", "Total das sangrias", null, sangTotal]);
  for (const p of pays.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))) {
    rows.push(["Contas a pagar (vencimento no período)", `${p.description} - ${STATUS_LABEL[p.status]}`, p.dueDate, p.amount]);
  }
  rows.push(["Contas a pagar (vencimento no período)", "Em aberto (pendentes e atrasadas)", null, paysOpen]);
  for (const r of recs.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))) {
    rows.push(["Contas a receber (vencimento no período)", `${r.customerName || "Cliente"} - ${STATUS_LABEL[r.status]}`, r.dueDate, r.amount]);
  }
  rows.push(["Contas a receber (vencimento no período)", "Em aberto (pendentes e atrasadas)", null, recsOpen]);

  return finalize({
    id: "financeiro",
    title: "Relatório Financeiro",
    filters: [periodText(f.from, f.to), opts.canSeeCost ? "Resultado = receita - custo dos produtos - despesas" : "Resultado = receita - despesas"],
    columns: [
      { key: "secao", label: "Seção" },
      { key: "descricao", label: "Descrição" },
      { key: "data", label: "Data", format: "date" },
      { key: "valor", label: "Valor", format: "money", align: "right" },
    ],
    rows,
    totals: ["RESULTADO DO PERÍODO", "", null, result],
    summary: [
      summaryItem("Receita", fmtMoney(revenue)),
      summaryItem("Custo dos produtos", fmtMoney(cogs), true),
      summaryItem("Despesas", fmtMoney(expTotal)),
      summaryItem("Sangrias", fmtMoney(sangTotal)),
      summaryItem("A pagar em aberto", fmtMoney(paysOpen)),
      summaryItem("A receber em aberto", fmtMoney(recsOpen)),
      summaryItem("Resultado", fmtMoney(result)),
    ],
    hasCost: true,
  }, opts.canSeeCost);
}

