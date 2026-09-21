import type { Accessory, Device } from "@/types/inventory";
import { accessoryStockStatus } from "@/lib/accessories";
import type { BuildOptions, Cell, ReportResult } from "./types";
import { finalize, fmtMoney, money2, summaryItem } from "./format";

export interface StockFilters {
  kind: "todos" | "aparelhos" | "acessorios";
  category: string; // "" = todas
  brand: string;
  condition: string;
  location: string;
  // "estoque" = tudo menos Vendido (padrão) | "todos" | um status específico
  status: string;
}

export const DEFAULT_STOCK_FILTERS: StockFilters = {
  kind: "todos", category: "", brand: "", condition: "", location: "", status: "estoque",
};

// Status de um acessório para o relatório: Disponível / Estoque baixo / Sem estoque
function accessoryStatus(a: Accessory): string {
  const s = accessoryStockStatus(a);
  return s === "OK" ? "Disponível" : s;
}

export function buildStockReport(devices: Device[], accessories: Accessory[], f: StockFilters, opts: BuildOptions): ReportResult {
  const statusOk = (status: string) => {
    if (f.status === "todos" || !f.status) return true;
    if (f.status === "estoque") return status !== "Vendido";
    return status === f.status;
  };

  const rows: Cell[][] = [];
  let qty = 0, costTotal = 0, saleTotal = 0, costOfPriced = 0, noPrice = 0;

  const push = (r: Cell[], q: number, cost: number, price: number | null) => {
    rows.push(r);
    qty += q;
    costTotal += cost * q;
    if (price != null && price > 0) {
      saleTotal += price * q;
      costOfPriced += cost * q;
    } else noPrice += q;
  };

  if (f.kind !== "acessorios") {
    for (const d of devices) {
      if (!statusOk(d.status)) continue;
      if (f.category && d.category !== f.category) continue;
      if (f.brand && d.brand !== f.brand) continue;
      if (f.condition && d.condition !== f.condition) continue;
      if (f.location && d.location !== f.location) continue;
      const price = d.salePrice ?? null;
      const margin = price != null && d.cost > 0 ? ((price - d.cost) / d.cost) * 100 : null;
      push(
        ["Aparelho", d.category, d.brand, d.model, d.capacity, d.color, d.condition, d.location, d.status, d.serialImei || d.serial || "", 1, d.cost, price, d.cost, margin],
        1, d.cost, price
      );
    }
  }
  if (f.kind !== "aparelhos") {
    for (const a of accessories) {
      const status = accessoryStatus(a);
      if (!statusOk(status)) continue;
      if (f.category && a.category !== f.category) continue;
      if (f.brand || f.condition || f.location) continue; // acessório não tem marca/condição/local
      const price = a.price ?? null;
      const margin = price != null && price > 0 && a.cost > 0 ? ((price - a.cost) / a.cost) * 100 : null;
      push(
        ["Acessório", a.category, "", a.name, "", "", "", "", status, a.barcode || "", a.quantity, a.cost, price, a.cost * a.quantity, margin],
        a.quantity, a.cost, price
      );
    }
  }

  const marginTotal = costOfPriced > 0 ? ((saleTotal - costOfPriced) / costOfPriced) * 100 : null;
  const filters: string[] = [
    `Tipo: ${f.kind === "todos" ? "aparelhos e acessórios" : f.kind === "aparelhos" ? "só aparelhos" : "só acessórios"}`,
    `Status: ${f.status === "estoque" || !f.status ? "em estoque (sem vendidos)" : f.status === "todos" ? "todos" : f.status}`,
  ];
  if (f.category) filters.push(`Categoria: ${f.category}`);
  if (f.brand) filters.push(`Marca: ${f.brand}`);
  if (f.condition) filters.push(`Condição: ${f.condition}`);
  if (f.location) filters.push(`Local: ${f.location}`);

  return finalize({
    id: "estoque",
    title: "Relatório de Estoque",
    filters,
    columns: [
      { key: "tipo", label: "Tipo" },
      { key: "categoria", label: "Categoria" },
      { key: "marca", label: "Marca" },
      { key: "item", label: "Modelo / Produto" },
      { key: "capacidade", label: "Capac." },
      { key: "cor", label: "Cor" },
      { key: "condicao", label: "Condição" },
      { key: "local", label: "Local" },
      { key: "status", label: "Status" },
      { key: "codigo", label: "IMEI / Série / Código" },
      { key: "qtd", label: "Qtd", format: "int", align: "right" },
      { key: "custo", label: "Custo un.", format: "money", align: "right", cost: true },
      { key: "preco", label: "Preço de venda", format: "money", align: "right" },
      { key: "valorCusto", label: "Valor em estoque (custo)", format: "money", align: "right", cost: true },
      { key: "margem", label: "Margem", format: "percent", align: "right", cost: true },
    ],
    rows,
    totals: [`TOTAL (${rows.length} itens)`, "", "", "", "", "", "", "", "", "", qty, null, saleTotal || null, costTotal, marginTotal],
    summary: [
      summaryItem("Itens", String(rows.length)),
      summaryItem("Unidades", String(qty)),
      summaryItem("Valor de venda em estoque", fmtMoney(money2(saleTotal))),
      summaryItem("Valor em estoque (custo)", fmtMoney(money2(costTotal)), true),
      summaryItem("Margem potencial", fmtMoney(money2(saleTotal - costOfPriced)), true),
      ...(noPrice > 0 ? [summaryItem("Unidades sem preço de venda", String(noPrice))] : []),
    ],
    hasCost: true,
  }, opts.canSeeCost);
}
