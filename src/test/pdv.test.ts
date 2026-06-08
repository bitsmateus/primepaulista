import { describe, it, expect } from "vitest";
import {
  deviceSellPrice,
  accessorySellPrice,
  cartSubtotal,
  saleTotal,
  remainingToPay,
  changeDue,
  resolveDiscount,
} from "@/lib/pdv";
import { CartItem } from "@/types/inventory";

describe("PDV — preço do aparelho", () => {
  it("usa o preço de venda quando definido", () => {
    expect(deviceSellPrice({ salePrice: 6200, cost: 5000 })).toBe(6200);
  });
  it("cai no custo quando não há preço de venda", () => {
    expect(deviceSellPrice({ salePrice: undefined, cost: 5000 })).toBe(5000);
  });
  it("cai no custo quando o preço de venda é zero/inválido", () => {
    expect(deviceSellPrice({ salePrice: 0, cost: 5000 })).toBe(5000);
  });
});

describe("PDV — preço do acessório", () => {
  it("usa o preço quando definido", () => {
    expect(accessorySellPrice({ price: 80, cost: 20 })).toBe(80);
  });
  it("cai no custo quando não há preço", () => {
    expect(accessorySellPrice({ price: undefined, cost: 20 })).toBe(20);
  });
});

describe("PDV — totais", () => {
  const items: CartItem[] = [
    { id: "1", type: "device", name: "iPhone", price: 6000, quantity: 1 },
    { id: "2", type: "accessory", name: "Capa", price: 80, quantity: 2 },
  ];

  it("subtotal soma preço × quantidade", () => {
    expect(cartSubtotal(items)).toBe(6160);
  });

  it("total desconta a troca", () => {
    expect(saleTotal(6160, 1500)).toBe(4660);
  });

  it("total nunca fica negativo", () => {
    expect(saleTotal(1000, 1500)).toBe(0);
  });

  it("total desconta troca e desconto geral", () => {
    expect(saleTotal(6160, 1000, 160)).toBe(5000);
  });
});

describe("PDV — desconto geral (R$/%)", () => {
  it("desconto em reais", () => {
    expect(resolveDiscount(1000, 150, "R$")).toBe(150);
  });
  it("desconto em porcentagem", () => {
    expect(resolveDiscount(1000, 10, "%")).toBe(100);
  });
  it("não passa do valor base", () => {
    expect(resolveDiscount(1000, 1500, "R$")).toBe(1000);
  });
  it("zero ou negativo = sem desconto", () => {
    expect(resolveDiscount(1000, 0, "R$")).toBe(0);
    expect(resolveDiscount(1000, -50, "%")).toBe(0);
  });

  it("restante = total - pago", () => {
    expect(remainingToPay(4660, 4000)).toBe(660);
    expect(remainingToPay(4660, 4660)).toBe(0);
  });

  it("troco aparece quando paga a mais", () => {
    expect(changeDue(4660, 5000)).toBe(340);
    expect(changeDue(4660, 4660)).toBe(0);
    expect(changeDue(4660, 4000)).toBe(0);
  });
});
