import { Sale } from "@/types/inventory";
import { onlyDigits } from "@/lib/customers";

export function computeSaleTotal(subtotal: number, tradeInDiscount: number, discount: number): number {
  return Math.max(0, subtotal - tradeInDiscount - discount);
}

// Valor total da venda do(s) item(ns) vendido(s) (ex.: aparelho novo), sem
// descontar o crédito da troca — a troca é uma forma de pagamento, não um
// abatimento do valor vendido. Usado para exibir o "Total" da venda na lista,
// diferente de `sale.total`, que é líquido de troca (usado no caixa/recibo).
export function saleFullValue(sale: Sale): number {
  return Math.max(0, sale.subtotal - sale.discount);
}

export function saleItemsSummary(sale: Sale): string {
  if (!sale.items.length) return "—";
  return sale.items.map((i) => `${i.quantity}× ${i.name}`).join(", ");
}

export function salePaymentLabel(sale: Sale): string {
  if (!sale.payments.length) return "—";
  return [...new Set(sale.payments.map((p) => p.method))].join(", ");
}

export function saleMatchesSearch(sale: Sale, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = onlyDigits(q);
  if (sale.customer?.name.toLowerCase().includes(q)) return true;
  if ((sale.seller || "").toLowerCase().includes(q)) return true;
  if (sale.items.some((i) => i.name.toLowerCase().includes(q) || (i.serial || "").toLowerCase().includes(q)))
    return true;
  if (qDigits && onlyDigits(sale.customer?.whatsapp || "").includes(qDigits)) return true;
  return false;
}

export interface SalesSummary {
  count: number;
  gross: number;
  net: number; // exclui devolvidas
  returned: number;
}

export function buildSalesSummary(sales: Sale[]): SalesSummary {
  let gross = 0;
  let net = 0;
  let returned = 0;
  for (const s of sales) {
    gross += s.total;
    if (s.returnedAt) returned += 1;
    else net += s.total;
  }
  return { count: sales.length, gross, net, returned };
}
