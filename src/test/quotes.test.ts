import { describe, it, expect } from "vitest";
import {
  buildQuoteSummary, canConvertQuote, defaultValidUntil, normalizePhoneBR, quoteDisplayStatus,
  quoteItemsSummary, quoteMatchesSearch, quoteTotals, quoteWhatsappText, resolveQuoteForSale, whatsappLink,
} from "@/lib/quotes";
import { PAYMENT_METHODS, allowsInstallments, isCardMethod } from "@/lib/payments";
import { Accessory, Device } from "@/types/inventory";
import { Quote } from "@/types/quote";

const mkQuote = (over: Partial<Quote> = {}): Quote => ({
  id: "q1", number: 12, customerName: "Maria da Silva", customerPhone: "(11) 98888-7777",
  sellerName: "Gabriel", status: "Aberto", validUntil: new Date("2026-12-31T23:59:59"),
  subtotal: 5000, discount: 0, total: 5000, paymentTerms: "PIX", notes: "",
  createdAt: new Date("2026-09-01"), updatedAt: new Date("2026-09-01"),
  items: [{ id: "i1", type: "device", productId: "d1", name: "iPhone 15 128GB", price: 5000, quantity: 1 }],
  ...over,
});

const mkDevice = (over: Partial<Device> = {}): Device => ({
  id: "d1", category: "iPhone", brand: "Apple", location: "Estoque", model: "iPhone 15", capacity: "128",
  color: "Preto", condition: "Seminovo", batteryHealth: 90, supplier: "", cost: 3000,
  serialImei: "IMEI1", internalSerial: "", status: "Disponível", createdAt: new Date(), ...over,
});

const mkAcc = (over: Partial<Accessory> = {}): Accessory => ({
  id: "a1", name: "Capa", category: "Capas", subcategory: "Silicone", compatibleModel: "iPhone 15",
  quantity: 5, minQuantity: 1, cost: 10, barcode: "ACC", createdAt: new Date(), ...over,
});

describe("quoteTotals", () => {
  it("soma itens e aplica desconto", () => {
    expect(quoteTotals([{ price: 100, quantity: 2 }, { price: 50, quantity: 1 }], 30)).toEqual({ subtotal: 250, total: 220 });
  });
  it("total nunca fica negativo", () => {
    expect(quoteTotals([{ price: 10, quantity: 1 }], 999).total).toBe(0);
  });
  it("desconto negativo é ignorado", () => {
    expect(quoteTotals([{ price: 10, quantity: 1 }], -5).total).toBe(10);
  });
});

describe("defaultValidUntil", () => {
  it("7 dias, no fim do dia", () => {
    const d = defaultValidUntil(new Date("2026-09-01T10:00:00"));
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });
});

describe("quoteDisplayStatus", () => {
  const now = new Date("2026-09-21T12:00:00");
  it("aberto dentro da validade continua Aberto", () => {
    expect(quoteDisplayStatus(mkQuote(), now)).toBe("Aberto");
  });
  it("aberto/enviado vencido vira Expirado", () => {
    expect(quoteDisplayStatus(mkQuote({ validUntil: new Date("2026-09-20T23:59:59") }), now)).toBe("Expirado");
    expect(quoteDisplayStatus(mkQuote({ status: "Enviado", validUntil: new Date("2026-09-20T23:59:59") }), now)).toBe("Expirado");
  });
  it("aprovado, recusado e convertido não expiram", () => {
    const old = new Date("2020-01-01");
    for (const st of ["Aprovado", "Recusado", "Convertido"] as const) {
      expect(quoteDisplayStatus(mkQuote({ status: st, validUntil: old }), now)).toBe(st);
    }
  });
  it("sem validade nunca expira", () => {
    expect(quoteDisplayStatus(mkQuote({ validUntil: undefined }), now)).toBe("Aberto");
  });
});

describe("canConvertQuote", () => {
  it("não converte o que já foi convertido nem o recusado", () => {
    expect(canConvertQuote({ status: "Convertido" })).toBe(false);
    expect(canConvertQuote({ status: "Recusado" })).toBe(false);
    expect(canConvertQuote({ status: "Aberto" })).toBe(true);
    expect(canConvertQuote({ status: "Aprovado" })).toBe(true);
  });
});

describe("quoteMatchesSearch", () => {
  const q = mkQuote();
  it("vazio casa com tudo", () => expect(quoteMatchesSearch(q, "  ")).toBe(true));
  it("por número, com ou sem #", () => {
    expect(quoteMatchesSearch(q, "12")).toBe(true);
    expect(quoteMatchesSearch(q, "#12")).toBe(true);
    expect(quoteMatchesSearch(q, "13")).toBe(false);
  });
  it("por cliente, vendedor, produto e telefone", () => {
    expect(quoteMatchesSearch(q, "maria")).toBe(true);
    expect(quoteMatchesSearch(q, "gabriel")).toBe(true);
    expect(quoteMatchesSearch(q, "iphone 15")).toBe(true);
    expect(quoteMatchesSearch(q, "98888")).toBe(true);
    expect(quoteMatchesSearch(q, "xiaomi")).toBe(false);
  });
});

describe("buildQuoteSummary", () => {
  const now = new Date("2026-09-21T12:00:00");
  const list = [
    mkQuote({ id: "1", total: 1000 }),
    mkQuote({ id: "2", status: "Enviado", total: 2000 }),
    mkQuote({ id: "3", status: "Convertido", total: 4000 }),
    mkQuote({ id: "4", status: "Recusado", total: 500 }),
    mkQuote({ id: "5", validUntil: new Date("2026-01-01"), total: 700 }), // expirado
  ];
  const s = buildQuoteSummary(list, now);
  it("conta em aberto (sem expirados e recusados)", () => {
    expect(s.openCount).toBe(2);
    expect(s.openValue).toBe(3000);
  });
  it("conta convertidos e taxa de conversão", () => {
    expect(s.convertedCount).toBe(1);
    expect(s.convertedValue).toBe(4000);
    expect(s.conversionRate).toBe(20);
  });
  it("lista vazia não divide por zero", () => {
    expect(buildQuoteSummary([], now).conversionRate).toBe(0);
  });
});

describe("quoteItemsSummary", () => {
  it("resume itens", () => {
    expect(quoteItemsSummary(mkQuote())).toBe("1× iPhone 15 128GB");
    expect(quoteItemsSummary({ items: [] })).toBe("—");
  });
});

describe("WhatsApp", () => {
  it("normaliza telefone BR para 55 + DDD + número", () => {
    expect(normalizePhoneBR("(11) 98888-7777")).toBe("5511988887777");
    expect(normalizePhoneBR("11 3333-4444")).toBe("551133334444");
  });
  it("não duplica o 55 e aceita vazio", () => {
    expect(normalizePhoneBR("+55 11 98888-7777")).toBe("5511988887777");
    expect(normalizePhoneBR("")).toBe("");
  });
  it("monta o link com texto codificado", () => {
    const link = whatsappLink("(11) 98888-7777", "olá & tudo bem?");
    expect(link).toBe("https://wa.me/5511988887777?text=ol%C3%A1%20%26%20tudo%20bem%3F");
  });
  it("texto traz itens, total, pagamento e validade", () => {
    const t = quoteWhatsappText(mkQuote({ discount: 100, total: 4900, paymentTerms: "PIX ou cartão em até 12x" }), "Prime Paulista");
    expect(t).toContain("Olá, Maria!");
    expect(t).toContain("orçamento nº 12");
    expect(t).toContain("1× iPhone 15 128GB");
    expect(t).toContain("Desconto");
    expect(t).toContain("Total: R$");
    expect(t).toContain("PIX ou cartão em até 12x");
    expect(t).toContain("Válido até");
  });
  it("sem desconto não mostra a linha de desconto", () => {
    expect(quoteWhatsappText(mkQuote(), "Loja")).not.toContain("Desconto");
  });
});

describe("resolveQuoteForSale", () => {
  let n = 0;
  const id = () => `id-${++n}`;

  it("leva aparelho disponível com o preço negociado e a garantia da condição", () => {
    const r = resolveQuoteForSale(mkQuote(), [mkDevice()], [], id);
    expect(r.skipped).toEqual([]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ type: "device", deviceId: "d1", price: 5000, quantity: 1, warrantyDays: 180, serial: "IMEI1" });
  });
  it("aceita aparelho reservado", () => {
    expect(resolveQuoteForSale(mkQuote(), [mkDevice({ status: "Reservado" })], [], id).items).toHaveLength(1);
  });
  it("pula aparelho vendido, com o motivo", () => {
    const r = resolveQuoteForSale(mkQuote(), [mkDevice({ status: "Vendido" })], [], id);
    expect(r.items).toHaveLength(0);
    expect(r.skipped[0]).toMatch(/Vendido/);
  });
  it("pula aparelho que sumiu do estoque", () => {
    expect(resolveQuoteForSale(mkQuote(), [], [], id).skipped[0]).toMatch(/não encontrado/);
  });
  it("pula item avulso (sem produto do estoque)", () => {
    const q = mkQuote({ items: [{ id: "i", type: "device", name: "Sob encomenda", price: 9000, quantity: 1 }] });
    const r = resolveQuoteForSale(q, [], [], id);
    expect(r.items).toHaveLength(0);
    expect(r.skipped[0]).toMatch(/avulso/);
  });
  it("acessório: leva a quantidade pedida quando há estoque", () => {
    const q = mkQuote({ items: [{ id: "i", type: "accessory", productId: "a1", name: "Capa", price: 79, quantity: 2 }] });
    const r = resolveQuoteForSale(q, [], [mkAcc({ quantity: 5 })], id);
    expect(r.items[0]).toMatchObject({ type: "accessory", accessoryId: "a1", quantity: 2, price: 79 });
    expect(r.adjusted).toEqual([]);
  });
  it("acessório: reduz a quantidade ao estoque e avisa", () => {
    const q = mkQuote({ items: [{ id: "i", type: "accessory", productId: "a1", name: "Capa", price: 79, quantity: 4 }] });
    const r = resolveQuoteForSale(q, [], [mkAcc({ quantity: 2 })], id);
    expect(r.items[0].quantity).toBe(2);
    expect(r.adjusted[0]).toMatch(/só há 2/);
  });
  it("acessório sem estoque é pulado", () => {
    const q = mkQuote({ items: [{ id: "i", type: "accessory", productId: "a1", name: "Capa", price: 79, quantity: 1 }] });
    const r = resolveQuoteForSale(q, [], [mkAcc({ quantity: 0 })], id);
    expect(r.items).toHaveLength(0);
    expect(r.skipped[0]).toMatch(/sem estoque/);
  });
  it("mesmo aparelho duas vezes: só o primeiro entra", () => {
    const item = { id: "i", type: "device" as const, productId: "d1", name: "iPhone", price: 5000, quantity: 1 };
    const r = resolveQuoteForSale(mkQuote({ items: [item, { ...item, id: "j" }] }), [mkDevice()], [], id);
    expect(r.items).toHaveLength(1);
    expect(r.skipped[0]).toMatch(/repetido/);
  });
  it("mesmo acessório em duas linhas respeita o saldo total", () => {
    const line = { id: "i", type: "accessory" as const, productId: "a1", name: "Capa", price: 79, quantity: 3 };
    const r = resolveQuoteForSale(mkQuote({ items: [line, { ...line, id: "j" }] }), [], [mkAcc({ quantity: 4 })], id);
    expect(r.items.reduce((s, c) => s + c.quantity, 0)).toBe(4);
  });
});

describe("formas de pagamento", () => {
  it("são 6, incluindo Mercado Pago e Outro", () => {
    expect(PAYMENT_METHODS).toHaveLength(6);
    expect(PAYMENT_METHODS).toContain("Mercado Pago / Link de Pagamento");
    expect(PAYMENT_METHODS).toContain("Outro / Verificação Externa");
  });
  it("só cartão paga taxa de maquininha", () => {
    expect(isCardMethod("Cartão de Crédito")).toBe(true);
    expect(isCardMethod("Cartão de Débito")).toBe(true);
    expect(isCardMethod("PIX")).toBe(false);
    expect(isCardMethod("Mercado Pago / Link de Pagamento")).toBe(false);
  });
  it("só o crédito parcela", () => {
    expect(allowsInstallments("Cartão de Crédito")).toBe(true);
    expect(allowsInstallments("Cartão de Débito")).toBe(false);
    expect(allowsInstallments("Mercado Pago / Link de Pagamento")).toBe(false);
  });
});
