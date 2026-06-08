import { Device } from "@/types/inventory";

// Dias que o aparelho está em estoque
export function daysInStock(createdAt: Date | string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
}

// Margem em R$ (preço de venda - custo); null quando não há preço definido
export function deviceMargin(d: Pick<Device, "salePrice" | "cost">): number | null {
  return d.salePrice != null ? d.salePrice - d.cost : null;
}

// Margem em %
export function deviceMarginPct(d: Pick<Device, "salePrice" | "cost">): number | null {
  const m = deviceMargin(d);
  if (m == null) return null;
  return d.cost > 0 ? (m / d.cost) * 100 : 0;
}

export interface StockReport {
  total: number;
  inStock: number;
  sold: number;
  maintenance: number;
  stockValue: number;
  potentialMargin: number;
  byCategory: Record<string, number>;
}

// Resumo de estoque para o relatório do topo
export function buildStockReport(devices: Device[]): StockReport {
  const inStock = devices.filter((d) => d.status === "Disponível" || d.status === "Reservado");
  const stockValue = inStock.reduce((s, d) => s + (d.cost || 0), 0);
  const potentialMargin = inStock.reduce(
    (s, d) => s + (d.salePrice != null ? d.salePrice - d.cost : 0),
    0
  );
  const byCategory: Record<string, number> = {};
  for (const d of devices) {
    const c = d.category || "iPhone";
    byCategory[c] = (byCategory[c] || 0) + 1;
  }
  return {
    total: devices.length,
    inStock: inStock.length,
    sold: devices.filter((d) => d.status === "Vendido").length,
    maintenance: devices.filter((d) => d.status === "Em Manutenção").length,
    stockValue,
    potentialMargin,
    byCategory,
  };
}
