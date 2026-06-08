import { describe, it, expect } from "vitest";
import { isReturned, canReturn, netSalesTotal } from "@/lib/returns";
import { Sale, Customer } from "@/types/inventory";

const mkCustomer = (): Customer => ({
  id: "c1", name: "João", cpf: "", whatsapp: "", birthday: "",
  leadOrigin: "Instagram", createdAt: new Date(),
});
const mkSale = (over: Partial<Sale>): Sale => ({
  id: "s1", customer: mkCustomer(), items: [], payments: [],
  seller: "Gabriel" as Sale["seller"], subtotal: 0, tradeInDiscount: 0,
  discount: 0, total: 1000, createdAt: new Date(), ...over,
});

describe("devolução", () => {
  it("isReturned reflete returnedAt", () => {
    expect(isReturned(mkSale({}))).toBe(false);
    expect(isReturned(mkSale({ returnedAt: new Date() }))).toBe(true);
  });

  it("canReturn: só admin e venda ativa", () => {
    const ativa = mkSale({});
    const devolvida = mkSale({ returnedAt: new Date() });
    expect(canReturn(ativa, true)).toBe(true);
    expect(canReturn(ativa, false)).toBe(false);
    expect(canReturn(devolvida, true)).toBe(false);
  });

  it("netSalesTotal exclui as devolvidas", () => {
    const sales = [
      mkSale({ id: "a", total: 1000 }),
      mkSale({ id: "b", total: 500, returnedAt: new Date() }),
      mkSale({ id: "c", total: 250 }),
    ];
    expect(netSalesTotal(sales)).toBe(1250);
  });
});
