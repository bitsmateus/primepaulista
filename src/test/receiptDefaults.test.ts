import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateReceiptHTML } from "@/utils/receiptGenerator";
import { generateQuoteHTML } from "@/utils/quotePrint";
import { generateOSReceiptHTML } from "@/utils/osReceiptGenerator";
import { setStoreSettings, resetStoreSettings } from "@/lib/storeSettings";
import type { Sale, Device } from "@/types/inventory";
import type { Quote } from "@/types/quote";
import type { ServiceOrder } from "@/types/serviceOrder";

// Os HTMLs abaixo foram gerados com o código ANTES das configurações editáveis da loja
// (Fase 4A). Com os padrões, a saída precisa ser exatamente igual (byte a byte).
const FIX = path.resolve(__dirname, "fixtures");
const read = (f: string) => fs.readFileSync(path.join(FIX, f), "utf8");
const UPDATE = process.env.UPDATE_FIXTURES === "1";
function compare(file: string, html: string) {
  if (UPDATE) {
    fs.mkdirSync(FIX, { recursive: true });
    fs.writeFileSync(path.join(FIX, file), html, "utf8");
  }
  expect(html).toBe(read(file));
}

const sale: Sale = {
  id: "s1",
  customer: { id: "c1", name: "Maria Cliente", cpf: "123.456.789-01", whatsapp: "11988887777", birthday: "", leadOrigin: "Instagram", createdAt: new Date("2026-01-01T12:00:00Z") },
  items: [
    { id: "i1", type: "device", deviceId: "d1", name: "iPhone 15 Pro 256GB", serial: "350000000000011", price: 8500, quantity: 1, warrantyDays: 365 },
    { id: "i2", type: "accessory", accessoryId: "a1", name: "Capa Silicone", price: 79, quantity: 2 },
  ],
  payments: [{ id: "p1", method: "PIX", amount: 8000 }],
  seller: "Gabriel",
  subtotal: 8658,
  tradeInDiscount: 300,
  discount: 100,
  total: 8258,
  giftsCost: 0,
  requiresInvoice: false,
  createdAt: new Date("2026-03-10T15:00:00Z"),
};
const devices: Device[] = [
  { id: "d1", category: "iPhone", brand: "Apple", location: "Estoque", model: "iPhone 15 Pro", capacity: "256", color: "Titânio", condition: "Lacrado", batteryHealth: 100, supplier: "", cost: 7000, salePrice: 8500, serialImei: "350000000000011", imei2: "350000000000012", serial: "F2L15A", internalSerial: "", status: "Vendido", createdAt: new Date("2026-01-01T12:00:00Z") },
];

const quote = {
  id: "q1", number: 42, customerName: "João <Teste>", customerPhone: "11999990000", sellerName: "Gabriel",
  status: "Aberto", subtotal: 1000, discount: 50, total: 950, paymentTerms: "PIX à vista", notes: "Obs",
  validUntil: new Date("2099-12-31T12:00:00Z"), createdAt: new Date("2026-03-10T15:00:00Z"),
  items: [{ id: "qi1", type: "device", name: "iPhone 13", serial: "ABC", price: 1000, quantity: 1 }],
} as unknown as Quote;

const os = {
  id: "abcdef12-0000-0000-0000-000000000000", createdAt: new Date("2026-03-10T15:00:00Z"), completedAt: new Date("2026-03-12T15:00:00Z"),
  status: "Pronto para Retirada", customerName: "Ana", customerCpf: "", customerPhone: "11911112222", model: "iPhone 11", color: "Branco",
  serialImei: "1234", imei2: "", serial: "", batteryHealth: 0, checklist: { capa: true, chip: false, carregador: true },
  reportedIssue: "Tela quebrada", partDescription: "Tela", technicalNotes: "", origin: "Cliente", laborCost: 100, partCost: 0, chargedAmount: 100, costResponsibility: "Cliente",
} as unknown as ServiceOrder;

describe("documentos impressos com os padroes da loja", () => {
  it("recibo de venda identico ao anterior", () => {
    resetStoreSettings();
    compare("receipt-default.html", generateReceiptHTML(sale, devices));
  });
  it("orcamento identico ao anterior", () => {
    resetStoreSettings();
    compare("quote-default.html", generateQuoteHTML(quote));
  });
  it("recibo de OS identico ao anterior", () => {
    resetStoreSettings();
    compare("os-default.html", generateOSReceiptHTML(os));
  });
  it("mudar a loja muda os documentos e escapa HTML", () => {
    setStoreSettings({ name: "Loja <b>X</b>", slogan: "Slogan & Cia", whatsapp: "11 1111-1111", facebook: "fb", instagram: "@ig", email: "a@b.c", address: "Rua \"A\"", cnpj: "00.000.000/0001-00", pixKey: "" });
    const r = generateReceiptHTML(sale, devices);
    expect(r).toContain("11 1111-1111");
    expect(r).toContain("Rua &quot;A&quot;");
    expect(r).not.toContain("Loja <b>X</b>");
    const q = generateQuoteHTML(quote);
    expect(q).toContain("Loja &lt;b&gt;X&lt;/b&gt;");
    const o = generateOSReceiptHTML(os);
    expect(o).toContain("Loja &lt;b&gt;X&lt;/b&gt;");
    expect(o).toContain("Slogan &amp; Cia");
    resetStoreSettings();
  });
});
