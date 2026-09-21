import { Accessory, CartItem, Device } from "@/types/inventory";
import { Quote, QuoteDisplayStatus } from "@/types/quote";
import { onlyDigits } from "@/lib/customers";
import { warrantyDaysForCondition } from "@/lib/warranty";

export const QUOTE_VALIDITY_DAYS = 7;
export const DEFAULT_PAYMENT_TERMS = "PIX ou cartão em até 12x";

// Fim do dia (23:59:59) daqui a `days` dias
export function defaultValidUntil(now: Date = new Date(), days: number = QUOTE_VALIDITY_DAYS): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 0);
  return d;
}

export function quoteTotals(
  items: { price: number; quantity: number }[],
  discount: number
): { subtotal: number; total: number } {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  return { subtotal, total: Math.max(0, subtotal - Math.max(0, discount)) };
}

// Aberto/Enviado com a validade vencida ficam "Expirado". Aprovado, Recusado
// e Convertido são decisões já tomadas e não expiram.
export function quoteDisplayStatus(q: Pick<Quote, "status" | "validUntil">, now: Date = new Date()): QuoteDisplayStatus {
  if ((q.status === "Aberto" || q.status === "Enviado") && q.validUntil && q.validUntil.getTime() < now.getTime()) {
    return "Expirado";
  }
  return q.status;
}

// Ainda dá para vender (não foi convertido nem recusado)
export function canConvertQuote(q: Pick<Quote, "status">): boolean {
  return q.status !== "Convertido" && q.status !== "Recusado";
}

export function quoteItemsSummary(q: Pick<Quote, "items">): string {
  if (!q.items.length) return "—";
  return q.items.map((i) => `${i.quantity}× ${i.name}`).join(", ");
}

export function quoteMatchesSearch(q: Quote, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  if (`#${q.number}` === term || String(q.number) === term.replace(/^#/, "")) return true;
  if (q.customerName.toLowerCase().includes(term)) return true;
  if (q.sellerName.toLowerCase().includes(term)) return true;
  const digits = onlyDigits(term);
  if (digits && onlyDigits(q.customerPhone).includes(digits)) return true;
  return q.items.some((i) => i.name.toLowerCase().includes(term) || (i.serial ?? "").toLowerCase().includes(term));
}

export interface QuoteSummary {
  total: number;
  openCount: number; // aguardando decisão: Aberto/Enviado dentro da validade + Aprovado
  openValue: number;
  convertedCount: number;
  convertedValue: number;
  conversionRate: number; // % de orçamentos que viraram venda
}

export function buildQuoteSummary(quotes: Quote[], now: Date = new Date()): QuoteSummary {
  let openCount = 0, openValue = 0, convertedCount = 0, convertedValue = 0;
  for (const q of quotes) {
    const st = quoteDisplayStatus(q, now);
    if (st === "Aberto" || st === "Enviado" || st === "Aprovado") {
      openCount++;
      openValue += q.total;
    } else if (st === "Convertido") {
      convertedCount++;
      convertedValue += q.total;
    }
  }
  return {
    total: quotes.length,
    openCount,
    openValue,
    convertedCount,
    convertedValue,
    conversionRate: quotes.length ? (convertedCount / quotes.length) * 100 : 0,
  };
}

// ----- WhatsApp -----

// Telefone BR só com dígitos e com o código do país (55) quando faltar
export function normalizePhoneBR(phone: string): string {
  const d = onlyDigits(phone);
  if (!d) return "";
  return d.length <= 11 ? `55${d}` : d;
}

export function whatsappLink(phone: string, text: string): string {
  const n = normalizePhoneBR(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function quoteWhatsappText(q: Quote, storeName: string): string {
  const first = q.customerName.trim().split(/\s+/)[0] || "";
  const lines = [
    `Olá${first ? `, ${first}` : ""}! Segue seu orçamento nº ${q.number} da ${storeName}:`,
    "",
    ...q.items.map((i) => `• ${i.quantity}× ${i.name} — ${fmt(i.price * i.quantity)}`),
    "",
  ];
  if (q.discount > 0) lines.push(`Desconto: −${fmt(q.discount)}`);
  lines.push(`*Total: ${fmt(q.total)}*`);
  if (q.paymentTerms) lines.push(`Pagamento: ${q.paymentTerms}`);
  if (q.validUntil) lines.push(`Válido até ${q.validUntil.toLocaleDateString("pt-BR")}.`);
  lines.push("", "Qualquer dúvida é só chamar! 😊");
  return lines.join("\n");
}

// ----- Conversão em venda -----

export interface QuoteToCart {
  items: CartItem[];
  skipped: string[]; // itens que não puderam ir para o carrinho, com o motivo
  adjusted: string[]; // itens que foram, mas com quantidade menor
}

// Leva os itens do orçamento para o carrinho do PDV, conferindo o estoque de hoje:
// aparelho precisa estar disponível, acessório precisa ter saldo. Preço = o negociado.
export function resolveQuoteForSale(
  quote: Pick<Quote, "items">,
  devices: Device[],
  accessories: Accessory[],
  newId: () => string = () => crypto.randomUUID()
): QuoteToCart {
  const items: CartItem[] = [];
  const skipped: string[] = [];
  const adjusted: string[] = [];
  const usedDevices = new Set<string>();

  for (const it of quote.items) {
    if (!it.productId) {
      skipped.push(`${it.name}: item avulso, não está no estoque`);
      continue;
    }
    if (it.type === "device") {
      const dev = devices.find((d) => d.id === it.productId);
      if (!dev) { skipped.push(`${it.name}: não encontrado no estoque`); continue; }
      if (dev.status !== "Disponível" && dev.status !== "Reservado") {
        skipped.push(`${it.name}: não está mais disponível (${dev.status})`);
        continue;
      }
      if (usedDevices.has(dev.id)) { skipped.push(`${it.name}: aparelho repetido no orçamento`); continue; }
      usedDevices.add(dev.id);
      items.push({
        id: newId(),
        type: "device",
        deviceId: dev.id,
        name: it.name,
        serial: dev.serialImei || dev.internalSerial || it.serial,
        price: it.price,
        quantity: 1,
        warrantyDays: warrantyDaysForCondition(dev.condition),
      });
    } else {
      const acc = accessories.find((a) => a.id === it.productId);
      if (!acc || acc.quantity <= 0) { skipped.push(`${it.name}: sem estoque`); continue; }
      const already = items.filter((c) => c.accessoryId === acc.id).reduce((s, c) => s + c.quantity, 0);
      const room = acc.quantity - already;
      if (room <= 0) { skipped.push(`${it.name}: sem estoque`); continue; }
      const qty = Math.min(it.quantity, room);
      if (qty < it.quantity) adjusted.push(`${it.name}: só há ${room} em estoque (pedido: ${it.quantity})`);
      items.push({ id: newId(), type: "accessory", accessoryId: acc.id, name: it.name, price: it.price, quantity: qty });
    }
  }
  return { items, skipped, adjusted };
}
