import { describe, it, expect } from "vitest";
import {
  computeSaleTotal, saleItemsSummary, salePaymentLabel, saleMatchesSearch, buildSalesSummary, saleFullValue,
} from "@/lib/sales";
import { Sale, Customer } from "@/types/inventory";

const mkCustomer = (over: Partial<Customer>): Customer => ({
  id: "c1", name: "João Silva", cpf: "", whatsapp: "(11) 99999-0000", birthday: "",
  leadOrigin: "Instagram", createdAt: new Date(), ...over,
});
const mkSale = (over: Partial<Sale>): Sale => ({
  id: "s1", customer: mkCustomer({}), items: [], payments: [],
  seller: "Gabriel" as Sale["seller"], subtotal: 1000, tradeInDiscount: 0,
  discount: 0, total: 1000, giftsCost: 0, requiresInvoice: false, createdAt: new Date(), ...over,
});

describe("total da venda", () => {
  it("subtotal − troca − desconto, sem ficar negativo", () => {
    expect(computeSaleTotal(1000, 200, 100)).toBe(700);
    expect(computeSaleTotal(100, 0, 500)).toBe(0);
  });
});

describe("valor total da venda (bruto, sem descontar a troca)", () => {
  it("com troca: mostra o valor cheio do aparelho, não o valor pago", () => {
    // aparelho de 6000, troca de 4500 → cliente paga só 1500, mas o total
    // exibido na lista deve ser os 6000 do aparelho vendido
    const sale = mkSale({ subtotal: 6000, tradeInDiscount: 4500, discount: 0, total: 1500 });
    expect(saleFullValue(sale)).toBe(6000);
  });
  it("sem troca: igual ao subtotal menos o desconto geral", () => {
    const sale = mkSale({ subtotal: 1000, tradeInDiscount: 0, discount: 100, total: 900 });
    expect(saleFullValue(sale)).toBe(900);
  });
});

describe("resumos", () => {
  const sale = mkSale({
    items: [
      { id: "i1", type: "device", deviceId: "d1", name: "iPhone 15", serial: "ABC", price: 5000, quantity: 1 },
      { id: "i2", type: "accessory", accessoryId: "a1", name: "Capa", price: 100, quantity: 2 },
    ],
    payments: [
      { id: "p1", method: "PIX", amount: 3000 },
      { id: "p2", method: "PIX", amount: 2100 },
    ],
  });
  it("resumo de itens", () => {
    expect(saleItemsSummary(sale)).toBe("1× iPhone 15, 2× Capa");
  });
  it("rótulo de pagamento deduplica métodos", () => {
    expect(salePaymentLabel(sale)).toBe("PIX");
  });
  it("venda sem itens/pagamentos", () => {
    expect(saleItemsSummary(mkSale({}))).toBe("—");
    expect(salePaymentLabel(mkSale({}))).toBe("—");
  });
});

describe("busca de venda", () => {
  const sale = mkSale({
    customer: mkCustomer({ name: "Maria", whatsapp: "11988887777" }),
    seller: "Tassio" as Sale["seller"],
    items: [{ id: "i1", type: "device", deviceId: "d1", name: "iPhone 15", serial: "XYZ999", price: 5000, quantity: 1 }],
  });
  it("acha por cliente", () => expect(saleMatchesSearch(sale, "maria")).toBe(true));
  it("acha por vendedor", () => expect(saleMatchesSearch(sale, "tassio")).toBe(true));
  it("acha por produto", () => expect(saleMatchesSearch(sale, "iphone")).toBe(true));
  it("acha por serial", () => expect(saleMatchesSearch(sale, "xyz999")).toBe(true));
  it("acha por telefone sem formatação", () => expect(saleMatchesSearch(sale, "988887777")).toBe(true));
  it("query vazia retorna true", () => expect(saleMatchesSearch(sale, "")).toBe(true));
  it("não acha o ausente", () => expect(saleMatchesSearch(sale, "samsung")).toBe(false));
});

describe("resumo de vendas", () => {
  it("conta, bruto, líquido (exclui devolvidas) e devolvidas", () => {
    const sales = [
      mkSale({ id: "a", total: 1000 }),
      mkSale({ id: "b", total: 500, returnedAt: new Date() }),
      mkSale({ id: "c", total: 250 }),
    ];
    const s = buildSalesSummary(sales);
    expect(s.count).toBe(3);
    expect(s.gross).toBe(1750);
    expect(s.net).toBe(1250);
    expect(s.returned).toBe(1);
  });
});
