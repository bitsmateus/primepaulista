import { Sale } from "@/types/inventory";
import { AccessoryMap, DeviceMap, salesGrossProfit } from "@/lib/profit";

export interface SellerStat {
  seller: string;
  salesCount: number;
  revenue: number; // faturamento (soma do total das vendas)
  avgTicket: number; // faturamento / vendas
  profit: number; // lucro bruto (custo real de aparelho e acessório)
  avgProfit: number; // lucro / vendas (é o "ticket médio" do BI)
}

// Comparativo por vendedor. Recebe as vendas já filtradas (período, sem devolvidas).
// Vendas sem vendedor entram como "Sem vendedor".
export function sellerComparison(
  sales: Sale[],
  devicesById: DeviceMap,
  accessoriesById: AccessoryMap,
  sortBy: "profit" | "revenue" = "profit"
): SellerStat[] {
  const bySeller = new Map<string, Sale[]>();
  for (const s of sales) {
    const name = (s.seller || "").trim() || "Sem vendedor";
    if (!bySeller.has(name)) bySeller.set(name, []);
    bySeller.get(name)!.push(s);
  }
  const stats: SellerStat[] = [...bySeller.entries()].map(([seller, list]) => {
    const revenue = list.reduce((a, s) => a + s.total, 0);
    const profit = salesGrossProfit(list, devicesById, accessoriesById);
    return {
      seller,
      salesCount: list.length,
      revenue,
      avgTicket: list.length ? revenue / list.length : 0,
      profit,
      avgProfit: list.length ? profit / list.length : 0,
    };
  });
  return stats.sort((a, b) => b[sortBy] - a[sortBy] || a.seller.localeCompare(b.seller, "pt-BR"));
}
