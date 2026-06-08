import { Accessory } from "@/types/inventory";

export type StockStatus = "Sem estoque" | "Estoque baixo" | "OK";

export function accessoryStockStatus(a: Pick<Accessory, "quantity" | "minQuantity">): StockStatus {
  if (a.quantity <= 0) return "Sem estoque";
  if (a.quantity <= a.minQuantity) return "Estoque baixo";
  return "OK";
}

// Margem unitária em R$ (preço - custo); null quando não há preço definido
export function accessoryMargin(a: Pick<Accessory, "price" | "cost">): number | null {
  return a.price != null && a.price > 0 ? a.price - a.cost : null;
}

export function accessoryMarginPct(a: Pick<Accessory, "price" | "cost">): number | null {
  const m = accessoryMargin(a);
  if (m == null) return null;
  return a.cost > 0 ? (m / a.cost) * 100 : 0;
}

export interface AccessoryReport {
  distinct: number; // itens distintos
  totalUnits: number; // soma das quantidades
  stockValue: number; // custo total em estoque
  lowStock: number; // em estoque baixo (qtd > 0)
  outOfStock: number; // sem estoque
  potentialMargin: number; // margem se vender tudo (com preço definido)
}

export function buildAccessoryReport(accessories: Accessory[]): AccessoryReport {
  let totalUnits = 0;
  let stockValue = 0;
  let lowStock = 0;
  let outOfStock = 0;
  let potentialMargin = 0;
  for (const a of accessories) {
    totalUnits += a.quantity;
    stockValue += a.cost * a.quantity;
    const st = accessoryStockStatus(a);
    if (st === "Sem estoque") outOfStock++;
    else if (st === "Estoque baixo") lowStock++;
    if (a.price != null && a.price > 0) potentialMargin += (a.price - a.cost) * a.quantity;
  }
  return {
    distinct: accessories.length,
    totalUnits,
    stockValue,
    lowStock,
    outOfStock,
    potentialMargin,
  };
}
