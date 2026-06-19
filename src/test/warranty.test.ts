import { describe, it, expect } from "vitest";
import {
  warrantyDaysForCondition, warrantyUntil, isWarrantyActive,
  warrantyDaysLeft, warrantyLabel, buildWarrantyRecords, warrantyMatchesSearch,
} from "@/lib/warranty";
import { Sale, Customer } from "@/types/inventory";

const mkCustomer = (over: Partial<Customer>): Customer => ({
  id: "c1", name: "João Silva", cpf: "", whatsapp: "(11) 99999-0000", birthday: "",
  leadOrigin: "Instagram", createdAt: new Date(), ...over,
});

describe("dias de garantia por condição", () => {
  it("Lacrado = 365, Seminovo = 180", () => {
    expect(warrantyDaysForCondition("Lacrado")).toBe(365);
    expect(warrantyDaysForCondition("Seminovo")).toBe(180);
    expect(warrantyDaysForCondition("")).toBe(180);
  });
});

describe("vigência da garantia", () => {
  const sale = new Date(2026, 0, 1);
  it("data final = venda + dias", () => {
    expect(warrantyUntil(sale, 90).getTime()).toBe(new Date(2026, 0, 1).getTime() + 90 * 86400000);
  });
  it("ativa dentro do prazo", () => {
    expect(isWarrantyActive(sale, 90, new Date(2026, 1, 1))).toBe(true);
  });
  it("expirada após o prazo", () => {
    expect(isWarrantyActive(sale, 90, new Date(2026, 5, 1))).toBe(false);
  });
  it("sem garantia (0 dias) nunca ativa", () => {
    expect(isWarrantyActive(sale, 0, sale)).toBe(false);
  });
  it("dias restantes não fica negativo", () => {
    expect(warrantyDaysLeft(sale, 90, new Date(2026, 5, 1))).toBe(0);
    expect(warrantyDaysLeft(sale, 90, new Date(2026, 0, 31))).toBe(60);
  });
  it("rótulo", () => {
    expect(warrantyLabel(365)).toBe("1 ano");
    expect(warrantyLabel(90)).toBe("90 dias");
    expect(warrantyLabel(0)).toBe("Sem garantia");
  });
});

describe("registros de garantia a partir das vendas", () => {
  const mkSale = (over: Partial<Sale>): Sale => ({
    id: "s1", customer: mkCustomer({}), items: [], payments: [],
    seller: "Gabriel" as Sale["seller"], subtotal: 0, tradeInDiscount: 0,
    discount: 0, total: 0, createdAt: new Date(2026, 0, 1), ...over,
  });
  const now = new Date(2026, 1, 1);
  const sales = [
    mkSale({
      id: "s1", createdAt: new Date(2026, 0, 1),
      customer: mkCustomer({ name: "Maria", whatsapp: "11988887777" }),
      items: [
        { id: "i1", type: "device", deviceId: "d1", name: "iPhone 15", serial: "ABC123", price: 5000, quantity: 1, warrantyDays: 365 },
        { id: "i2", type: "accessory", accessoryId: "a1", name: "Capa", price: 100, quantity: 1 },
      ],
    }),
  ];

  it("gera um registro por aparelho (ignora acessório)", () => {
    const recs = buildWarrantyRecords(sales, now);
    expect(recs).toHaveLength(1);
    expect(recs[0].model).toBe("iPhone 15");
    expect(recs[0].days).toBe(365);
    expect(recs[0].active).toBe(true);
  });

  it("busca por serial, cliente, modelo e telefone", () => {
    const r = buildWarrantyRecords(sales, now)[0];
    expect(warrantyMatchesSearch(r, "abc123")).toBe(true);
    expect(warrantyMatchesSearch(r, "maria")).toBe(true);
    expect(warrantyMatchesSearch(r, "iphone")).toBe(true);
    expect(warrantyMatchesSearch(r, "988887777")).toBe(true);
    expect(warrantyMatchesSearch(r, "samsung")).toBe(false);
  });
});
