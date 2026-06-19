import { Sale } from "@/types/inventory";
import { onlyDigits } from "@/lib/customers";

const DAY = 1000 * 60 * 60 * 24;

// === Política de garantia (centralizada — AJUSTE AQUI se mudar) ===
// Conforme o Termo de Garantia da loja: lacrado 1 ano (fabricante),
// semi-novo 6 meses / 180 dias (bateria 90 dias), serviço de OS 90 dias.
export const WARRANTY_DAYS = {
  lacrado: 365, // aparelho lacrado (garantia do fabricante)
  seminovo: 180, // aparelho semi-novo (6 meses)
  servico: 90, // serviço de assistência (OS)
};

export const WARRANTY_TEXT = {
  lacrado: "Garantia de 1 ano pelo fabricante",
  seminovo: "Garantia de 6 meses (180 dias) — vide termo de garantia",
  servicoTitulo: "Garantia de 90 dias para o serviço realizado",
  servicoDescricao:
    "Cobre exclusivamente defeitos relacionados ao reparo/peça executados nesta OS. Não cobre danos por mau uso, quedas, contato com líquidos ou violação do lacre técnico.",
};

// Texto de garantia do aparelho vendido conforme a condição.
export function saleWarrantyText(condition: string): string {
  return condition === "Lacrado" ? WARRANTY_TEXT.lacrado : WARRANTY_TEXT.seminovo;
}

// Regra da loja: Lacrado = 1 ano (fabricante); Semi-novo = 6 meses (180 dias).
export function warrantyDaysForCondition(condition: string): number {
  return condition === "Lacrado" ? WARRANTY_DAYS.lacrado : WARRANTY_DAYS.seminovo;
}

export function warrantyUntil(saleDate: Date, days: number): Date {
  return new Date(new Date(saleDate).getTime() + days * DAY);
}

export function isWarrantyActive(saleDate: Date, days: number, now: Date): boolean {
  if (!days) return false;
  return warrantyUntil(saleDate, days).getTime() >= now.getTime();
}

export function warrantyDaysLeft(saleDate: Date, days: number, now: Date): number {
  if (!days) return 0;
  return Math.max(0, Math.ceil((warrantyUntil(saleDate, days).getTime() - now.getTime()) / DAY));
}

export function warrantyLabel(days: number): string {
  if (days >= 365) return "1 ano";
  if (days > 0) return `${days} dias`;
  return "Sem garantia";
}

export interface WarrantyRecord {
  saleId: string;
  customerName: string;
  customerPhone: string;
  model: string;
  serial: string;
  saleDate: Date;
  days: number;
  until: Date;
  active: boolean;
  daysLeft: number;
}

// Extrai um registro de garantia por aparelho vendido.
export function buildWarrantyRecords(sales: Sale[], now: Date): WarrantyRecord[] {
  const records: WarrantyRecord[] = [];
  for (const s of sales) {
    for (const it of s.items) {
      if (it.type !== "device") continue;
      const days = it.warrantyDays ?? 0;
      records.push({
        saleId: s.id,
        customerName: s.customer?.name ?? "—",
        customerPhone: s.customer?.whatsapp ?? "",
        model: it.name,
        serial: it.serial ?? "",
        saleDate: new Date(s.createdAt),
        days,
        until: warrantyUntil(s.createdAt, days),
        active: isWarrantyActive(s.createdAt, days, now),
        daysLeft: warrantyDaysLeft(s.createdAt, days, now),
      });
    }
  }
  return records.sort((a, b) => b.saleDate.getTime() - a.saleDate.getTime());
}

export function warrantyMatchesSearch(r: WarrantyRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = onlyDigits(q);
  if (r.customerName.toLowerCase().includes(q)) return true;
  if (r.model.toLowerCase().includes(q)) return true;
  if (r.serial.toLowerCase().includes(q)) return true;
  if (qDigits && onlyDigits(r.customerPhone).includes(qDigits)) return true;
  return false;
}
