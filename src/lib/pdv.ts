import { Device, Accessory, CartItem } from "@/types/inventory";

// Preço de venda do aparelho: usa o preço de venda cadastrado; se não houver, cai no custo.
export function deviceSellPrice(d: Pick<Device, "salePrice" | "cost">): number {
  return d.salePrice != null && d.salePrice > 0 ? d.salePrice : d.cost;
}

// Preço de venda do acessório: preço cadastrado ou, na falta, o custo.
export function accessorySellPrice(a: Pick<Accessory, "price" | "cost">): number {
  return a.price != null && a.price > 0 ? a.price : a.cost;
}

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

// Total da venda = subtotal - troca - desconto geral (nunca negativo)
export function saleTotal(subtotal: number, tradeInDiscount: number, discount = 0): number {
  return Math.max(0, subtotal - tradeInDiscount - discount);
}

// Converte um desconto informado em R$ ou % para valor em R$ (limitado à base)
export function resolveDiscount(base: number, value: number, mode: "R$" | "%"): number {
  if (!value || value <= 0) return 0;
  const v = mode === "%" ? (base * value) / 100 : value;
  return Math.min(Math.max(0, v), base);
}

// Quanto ainda falta pagar (positivo) — negativo/zero significa quitado
export function remainingToPay(total: number, paid: number): number {
  return total - paid;
}

// Troco quando o pago excede o total
export function changeDue(total: number, paid: number): number {
  return Math.max(0, paid - total);
}
