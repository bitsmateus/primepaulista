import { describe, it, expect } from "vitest";
import { buildDailySalesReport, deviceSerialOf, paymentText, toYmd } from "@/lib/dailySales";
import { CartItem, Device, PaymentEntry, Sale } from "@/types/inventory";

const day = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m - 1, d, h, min);

const mkDevice = (over: Partial<Device>): Device => ({
  id: "d1", category: "iPhone", brand: "Apple", location: "Estoque", model: "iPhone 14", capacity: "128",
  color: "Preto", condition: "Seminovo", batteryHealth: 90, supplier: "", cost: 3000,
  serialImei: "350000000000041", serial: "F2LSERIAL01", internalSerial: "", status: "Vendido", createdAt: new Date(), ...over,
});

const dItem = (deviceId: string, price: number, name = "iPhone 14 128GB Preto"): CartItem => ({
  id: deviceId, type: "device", deviceId, name, serial: "350000000000041", price, quantity: 1,
});
const aItem = (price: number, quantity: number, name = "Capa Silicone"): CartItem => ({
  id: `a-${name}`, type: "accessory", accessoryId: "a1", name, price, quantity,
});
const pay = (method: PaymentEntry["method"], amount: number, installments?: number): PaymentEntry => ({
  id: `${method}-${amount}`, method, amount, installments,
});

const mkSale = (over: Partial<Sale> & { items: CartItem[]; payments: PaymentEntry[] }): Sale => {
  const subtotal = over.items.reduce((s, i) => s + i.price * i.quantity, 0);
  return {
    id: Math.random().toString(36).slice(2),
    customer: { id: "c", name: "Maria", cpf: "", whatsapp: "", birthday: "", leadOrigin: "Instagram", createdAt: new Date() },
    seller: "Gabriel", subtotal, tradeInDiscount: 0, discount: 0, total: subtotal, giftsCost: 0,
    requiresInvoice: false, createdAt: day(2026, 9, 21), ...over,
  };
};

const devices = [
  mkDevice({}),
  mkDevice({ id: "d2", model: "iPhone 15", serial: "", internalSerial: "INT-2026-0007", serialImei: "350000000000099" }),
  mkDevice({ id: "d3", model: "iPhone 13", serial: "", internalSerial: "", serialImei: "350000000000077" }),
];

describe("deviceSerialOf", () => {
  it("usa o serial de fábrica", () => expect(deviceSerialOf(devices[0])).toBe("F2LSERIAL01"));
  it("sem serial, usa o serial interno", () => expect(deviceSerialOf(devices[1])).toBe("INT-2026-0007"));
  it("nunca devolve o IMEI", () => expect(deviceSerialOf(devices[2])).toBe(""));
  it("aparelho desconhecido = vazio", () => expect(deviceSerialOf(undefined)).toBe(""));
});

describe("buildDailySalesReport — seleção do dia", () => {
  const sales = [
    mkSale({ createdAt: day(2026, 9, 21, 15, 30), items: [dItem("d1", 4000)], payments: [pay("PIX", 4000)] }),
    mkSale({ createdAt: day(2026, 9, 21, 9, 5), items: [aItem(50, 2)], payments: [pay("Dinheiro", 100)] }),
    mkSale({ createdAt: day(2026, 9, 20, 23, 59), items: [aItem(10, 1)], payments: [pay("Dinheiro", 10)] }),
    mkSale({ createdAt: day(2026, 9, 22, 0, 1), items: [aItem(10, 1)], payments: [pay("Dinheiro", 10)] }),
  ];
  const r = buildDailySalesReport(sales, devices, "2026-09-21");
  it("só vendas da data escolhida", () => expect(r.count).toBe(2));
  it("ordena da mais antiga para a mais nova", () => expect(r.rows.map((x) => x.time)).toEqual(["09:05", "15:30"]));
  it("data sem vendas devolve vazio sem quebrar", () => {
    const e = buildDailySalesReport(sales, devices, "2026-01-01");
    expect(e.count).toBe(0);
    expect(e.totalReceived).toBe(0);
    expect(e.byMethod.map((m) => m.amount)).toEqual([0, 0, 0, 0]);
  });
  it("toYmd usa o dia local", () => expect(toYmd(day(2026, 9, 5, 23, 59))).toBe("2026-09-05"));
});

describe("buildDailySalesReport — itens e serial", () => {
  const s = mkSale({ items: [dItem("d1", 4000), dItem("d2", 5000, "iPhone 15"), aItem(50, 2)], payments: [pay("PIX", 9100)] });
  const line = buildDailySalesReport([s], devices, "2026-09-21").rows[0].lines;
  it("aparelho traz o número de série, não o IMEI", () => {
    expect(line[0]).toMatchObject({ kind: "device", serial: "F2LSERIAL01" });
    expect(JSON.stringify(line)).not.toContain("350000000000041");
  });
  it("sem serial de fábrica usa o interno", () => expect(line[1].serial).toBe("INT-2026-0007"));
  it("acessório mostra quantidade e nome", () => expect(line[2]).toEqual({ kind: "accessory", text: "2× Capa Silicone" }));
});

describe("buildDailySalesReport — totais por forma de pagamento", () => {
  const sales = [
    mkSale({ items: [dItem("d1", 4000)], payments: [pay("Dinheiro", 1000), pay("Cartão de Crédito", 3000, 3)] }),
    mkSale({ items: [aItem(100, 1)], payments: [pay("Cartão de Débito", 100)] }),
    mkSale({ items: [aItem(200, 1)], payments: [pay("Dinheiro", 200)] }),
    mkSale({ items: [aItem(50, 1)], payments: [pay("Mercado Pago / Link de Pagamento", 50)] }),
  ];
  const r = buildDailySalesReport(sales, devices, "2026-09-21");
  const get = (m: string) => r.byMethod.find((x) => x.method === m)!;
  it("soma cada forma", () => {
    expect(get("Dinheiro")).toMatchObject({ amount: 1200, count: 2 });
    expect(get("Cartão de Débito").amount).toBe(100);
    expect(get("Cartão de Crédito").amount).toBe(3000);
    expect(get("Mercado Pago / Link de Pagamento").amount).toBe(50);
  });
  it("PIX aparece zerado (forma principal)", () => expect(get("PIX")).toMatchObject({ amount: 0, count: 0 }));
  it("'Outro' não aparece quando não foi usado", () => expect(r.byMethod.some((m) => m.method === "Outro / Verificação Externa")).toBe(false));
  it("total recebido = soma de todas as formas", () => {
    expect(r.totalReceived).toBe(4350);
    expect(r.byMethod.reduce((s, m) => s + m.amount, 0)).toBe(4350);
  });
  it("ordem: dinheiro, débito, crédito, PIX…", () => {
    expect(r.byMethod.slice(0, 4).map((m) => m.method)).toEqual(["Dinheiro", "Cartão de Débito", "Cartão de Crédito", "PIX"]);
  });
  it("valor das vendas soma os itens", () => expect(r.totalSaleValue).toBe(4350));
});

describe("buildDailySalesReport — troca, desconto e devolução", () => {
  const withTrade = mkSale({
    items: [dItem("d1", 5000)], tradeInDiscount: 1500, discount: 100, total: 3400,
    tradeIn: { imei: "1", model: "iPhone 11", healthDescription: "", value: 1500 },
    payments: [pay("PIX", 3400)],
  });
  const returned = mkSale({ items: [aItem(80, 1)], payments: [pay("Dinheiro", 80)], returnedAt: new Date() });
  const r = buildDailySalesReport([withTrade, returned], devices, "2026-09-21");
  it("valor da venda desconta o desconto, mas não a troca", () => expect(r.rows[0].saleValue).toBe(4900));
  it("recebido é líquido da troca", () => expect(r.rows[0].received).toBe(3400));
  it("troca aparece separada", () => {
    expect(r.rows[0].tradeIn).toEqual({ model: "iPhone 11", value: 1500 });
    expect(r.totalTradeIn).toBe(1500);
  });
  it("devolvida fica fora dos totais e da contagem", () => {
    expect(r.count).toBe(1);
    expect(r.totalReceived).toBe(3400);
    expect(r.returned).toHaveLength(1);
    expect(r.byMethod.find((m) => m.method === "Dinheiro")!.amount).toBe(0);
  });
});

describe("paymentText", () => {
  it("crédito parcelado mostra as parcelas", () => expect(paymentText({ method: "Cartão de Crédito", amount: 1, installments: 3 })).toBe("Crédito 3x"));
  it("crédito à vista não mostra 1x", () => expect(paymentText({ method: "Cartão de Crédito", amount: 1, installments: 1 })).toBe("Crédito"));
  it("débito e dinheiro", () => {
    expect(paymentText({ method: "Cartão de Débito", amount: 1 })).toBe("Débito");
    expect(paymentText({ method: "Dinheiro", amount: 1 })).toBe("Dinheiro");
  });
});
