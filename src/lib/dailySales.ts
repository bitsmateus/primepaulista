import { Device, PaymentMethod, Sale } from "@/types/inventory";
import { saleFullValue } from "@/lib/sales";

// Relatório de vendas do dia (para conferir o caixa e imprimir): todas as vendas da data,
// com o aparelho identificado pelo NÚMERO DE SÉRIE (não pelo IMEI) e o total recebido por
// forma de pagamento. Vendas devolvidas ficam à parte e não entram nos totais.

export interface DailyLine {
  text: string; // "iPhone 14 128GB Preto" ou "2× Capa Silicone"
  serial?: string; // só para aparelhos
  kind: "device" | "accessory";
}

export interface DailyPayment {
  method: PaymentMethod;
  amount: number;
  installments?: number;
}

export interface DailySaleRow {
  id: string;
  time: string; // hh:mm
  customer: string;
  seller: string;
  lines: DailyLine[];
  saleValue: number; // valor da venda (itens − desconto)
  tradeIn?: { model: string; value: number };
  received: number; // soma dos pagamentos (já líquido da troca)
  payments: DailyPayment[];
  returned: boolean;
}

export interface MethodTotal {
  method: PaymentMethod;
  amount: number;
  count: number; // nº de pagamentos nessa forma
}

export interface DailySalesReport {
  date: string; // yyyy-mm-dd
  rows: DailySaleRow[]; // vendas válidas, da mais antiga para a mais nova
  returned: DailySaleRow[]; // devolvidas/estornadas (fora dos totais)
  count: number;
  totalSaleValue: number;
  totalTradeIn: number; // aparelhos recebidos na troca (abatidos do valor)
  totalReceived: number;
  byMethod: MethodTotal[];
}

// Ordem de exibição: as formas que o caixa mais confere primeiro
const METHOD_ORDER: PaymentMethod[] = [
  "Dinheiro",
  "Cartão de Débito",
  "Cartão de Crédito",
  "PIX",
  "Mercado Pago / Link de Pagamento",
  "Outro / Verificação Externa",
];
// Sempre aparecem (mesmo zeradas); as outras só quando houve recebimento
const ALWAYS_SHOWN: PaymentMethod[] = ["Dinheiro", "Cartão de Débito", "Cartão de Crédito", "PIX"];

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  "Dinheiro": "Dinheiro",
  "Cartão de Débito": "Débito",
  "Cartão de Crédito": "Crédito",
  "PIX": "PIX",
  "Mercado Pago / Link de Pagamento": "Mercado Pago / Link",
  "Outro / Verificação Externa": "Outro / Verificação externa",
};

// yyyy-mm-dd no fuso local
export function toYmd(d: Date): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

const hhmm = (d: Date) =>
  new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// Número de série do aparelho: o serial de fábrica; na falta dele o serial interno da loja.
// (Nunca o IMEI: o cliente pediu que o aparelho vendido seja identificado pelo serial.)
export function deviceSerialOf(d?: Pick<Device, "serial" | "internalSerial"> | null): string {
  return (d?.serial || d?.internalSerial || "").trim();
}

export function buildDailySalesReport(sales: Sale[], devices: Device[], ymd: string): DailySalesReport {
  const byId = new Map(devices.map((d) => [d.id, d]));
  const dayRows: DailySaleRow[] = sales
    .filter((s) => toYmd(s.createdAt) === ymd)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((s) => ({
      id: s.id,
      time: hhmm(s.createdAt),
      customer: s.customer?.name || "—",
      seller: s.seller || "—",
      lines: s.items.map((it): DailyLine =>
        it.type === "device"
          ? { kind: "device", text: it.name, serial: deviceSerialOf(it.deviceId ? byId.get(it.deviceId) : undefined) }
          : { kind: "accessory", text: `${it.quantity}× ${it.name}` }
      ),
      saleValue: saleFullValue(s),
      tradeIn: s.tradeIn && s.tradeInDiscount > 0 ? { model: s.tradeIn.model, value: s.tradeInDiscount } : undefined,
      received: s.payments.reduce((sum, p) => sum + p.amount, 0),
      payments: s.payments.map((p) => ({ method: p.method, amount: p.amount, installments: p.installments })),
      returned: !!s.returnedAt,
    }));

  const rows = dayRows.filter((r) => !r.returned);
  const returned = dayRows.filter((r) => r.returned);

  const totals = new Map<PaymentMethod, MethodTotal>();
  for (const r of rows) {
    for (const p of r.payments) {
      const t = totals.get(p.method) ?? { method: p.method, amount: 0, count: 0 };
      t.amount += p.amount;
      t.count += 1;
      totals.set(p.method, t);
    }
  }
  const byMethod = METHOD_ORDER.filter((m) => totals.has(m) || ALWAYS_SHOWN.includes(m)).map(
    (m) => totals.get(m) ?? { method: m, amount: 0, count: 0 }
  );

  return {
    date: ymd,
    rows,
    returned,
    count: rows.length,
    totalSaleValue: rows.reduce((s, r) => s + r.saleValue, 0),
    totalTradeIn: rows.reduce((s, r) => s + (r.tradeIn?.value ?? 0), 0),
    totalReceived: rows.reduce((s, r) => s + r.received, 0),
    byMethod,
  };
}

// "Crédito 3x" / "Dinheiro" — texto de um pagamento
export function paymentText(p: DailyPayment): string {
  const label = METHOD_LABEL[p.method] ?? p.method;
  return p.method === "Cartão de Crédito" && p.installments && p.installments > 1 ? `${label} ${p.installments}x` : label;
}
