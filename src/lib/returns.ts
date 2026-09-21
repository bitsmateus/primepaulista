import { Sale } from "@/types/inventory";

// Uma venda devolvida tem returnedAt preenchido.
export function isReturned(sale: Pick<Sale, "returnedAt">): boolean {
  return !!sale.returnedAt;
}

// Só quem tem permissão (devolver vendas) pode estornar, e apenas vendas ainda ativas.
export function canReturn(sale: Pick<Sale, "returnedAt">, allowed: boolean): boolean {
  return allowed && !isReturned(sale);
}

// Total líquido de vendas (exclui as devolvidas).
export function netSalesTotal(sales: Sale[]): number {
  return sales.filter((s) => !isReturned(s)).reduce((sum, s) => sum + s.total, 0);
}
