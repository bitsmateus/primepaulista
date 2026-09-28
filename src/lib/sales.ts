import { Device, Sale } from "@/types/inventory";
import { onlyDigits } from "@/lib/customers";
import { formatCapacity } from "@/lib/utils";

// Número da venda formatado para exibição, ex.: "Nº 001".
export function saleNumberLabel(n: number | undefined): string {
  return n != null ? `Nº ${String(n).padStart(3, "0")}` : "";
}

export interface SaleDeviceLine {
  itemId: string;
  modelo: string;
  imei1: string;
  imei2: string;
  serial: string;
}

// Linhas de aparelho vendido com modelo, IMEI 1/2 e nº de série — usadas no recibo e
// nos detalhes da venda. Busca o aparelho atual (pode ter serial/IMEI 2 cadastrados
// depois da venda); se o aparelho não existir mais, cai para o que foi salvo no item.
export function saleDeviceLines(sale: Sale, devices: Device[]): SaleDeviceLine[] {
  return sale.items
    .filter((i) => i.type === "device")
    .map((item) => {
      const dev = devices.find((d) => d.id === item.deviceId);
      const modelo = dev ? `${dev.model} ${formatCapacity(dev.capacity)} ${dev.color}`.trim() : item.name;
      return {
        itemId: item.id,
        modelo,
        imei1: dev?.serialImei || item.serial || "",
        imei2: dev?.imei2 || "",
        serial: dev?.serial || dev?.internalSerial || "",
      };
    });
}

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

export function saleMatchesSearch(sale: Sale, query: string, devices: Device[] = []): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = onlyDigits(q);
  if (sale.customer?.name.toLowerCase().includes(q)) return true;
  if ((sale.seller || "").toLowerCase().includes(q)) return true;
  if (sale.items.some((i) => i.name.toLowerCase().includes(q) || (i.serial || "").toLowerCase().includes(q)))
    return true;
  // número de série "de verdade" do aparelho (nunca o IMEI), buscado no cadastro atual
  if (saleDeviceLines(sale, devices).some((l) => l.serial.toLowerCase().includes(q))) return true;
  if (qDigits && onlyDigits(sale.customer?.whatsapp || "").includes(qDigits)) return true;
  // número da venda (Nº 001) — aceita "1", "01", "001", "#1"...
  if (qDigits && sale.saleNumber != null) {
    const padded = String(sale.saleNumber).padStart(3, "0");
    if (padded.includes(qDigits) || String(sale.saleNumber).includes(qDigits)) return true;
  }
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
