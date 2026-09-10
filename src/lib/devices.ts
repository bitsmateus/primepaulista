import { Device } from "@/types/inventory";

// Dias que o aparelho está em estoque
export function daysInStock(createdAt: Date | string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
}

// Converte a capacidade (ex.: "128", "256GB", "1TB") em GB, para ordenar
// numericamente (128 antes de 256, e não alfabeticamente).
export function capacityInGB(capacity: string): number {
  const s = (capacity || "").trim().toUpperCase();
  const m = s.match(/([\d.]+)\s*(TB|GB)?/);
  if (!m) return 0;
  const n = parseFloat(m[1]) || 0;
  return m[2] === "TB" ? n * 1024 : n;
}

// Chave de agrupamento visual: mesmo modelo + mesma capacidade formam um grupo
// (usado para separar visualmente com uma linha em branco entre grupos).
export function deviceGroupKey(d: Pick<Device, "model" | "capacity">): string {
  return `${d.model || ""}|${d.capacity || ""}`;
}

// Ordena por modelo e depois por capacidade, para que aparelhos do mesmo
// modelo/capacidade fiquem juntos e seja possível separar grupos visualmente.
export function sortDevicesByModel(devices: Device[]): Device[] {
  return [...devices].sort((a, b) => {
    const byModel = (a.model || "").localeCompare(b.model || "", "pt-BR");
    if (byModel !== 0) return byModel;
    return capacityInGB(a.capacity) - capacityInGB(b.capacity);
  });
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
