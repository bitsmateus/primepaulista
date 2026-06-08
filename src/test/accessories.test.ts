import { describe, it, expect } from "vitest";
import {
  accessoryStockStatus,
  accessoryMargin,
  accessoryMarginPct,
  buildAccessoryReport,
} from "@/lib/accessories";
import { Accessory } from "@/types/inventory";

const mk = (over: Partial<Accessory>): Accessory => ({
  id: Math.random().toString(),
  name: "Capa",
  category: "Capas",
  subcategory: "Silicone",
  compatibleModel: "iPhone 15",
  quantity: 10,
  minQuantity: 5,
  cost: 20,
  price: 80,
  barcode: "ACC-1",
  createdAt: new Date(),
  ...over,
});

describe("status de estoque do acessório", () => {
  it("OK quando acima do mínimo", () => {
    expect(accessoryStockStatus({ quantity: 10, minQuantity: 5 })).toBe("OK");
  });
  it("estoque baixo quando <= mínimo", () => {
    expect(accessoryStockStatus({ quantity: 5, minQuantity: 5 })).toBe("Estoque baixo");
  });
  it("sem estoque quando zero", () => {
    expect(accessoryStockStatus({ quantity: 0, minQuantity: 5 })).toBe("Sem estoque");
  });
});

describe("margem do acessório", () => {
  it("margem R$ e %", () => {
    const a = mk({ cost: 20, price: 80 });
    expect(accessoryMargin(a)).toBe(60);
    expect(accessoryMarginPct(a)).toBe(300);
  });
  it("sem preço → null", () => {
    const a = mk({ cost: 20, price: undefined });
    expect(accessoryMargin(a)).toBeNull();
    expect(accessoryMarginPct(a)).toBeNull();
  });
});

describe("relatório de acessórios", () => {
  const list = [
    mk({ quantity: 10, cost: 20, price: 80 }),  // OK, margem 60*10=600
    mk({ quantity: 3, minQuantity: 5, cost: 10, price: 30 }), // baixo, margem 20*3=60
    mk({ quantity: 0, minQuantity: 5, cost: 50, price: undefined }), // sem estoque
  ];
  const r = buildAccessoryReport(list);

  it("itens distintos e unidades", () => {
    expect(r.distinct).toBe(3);
    expect(r.totalUnits).toBe(13); // 10 + 3 + 0
  });
  it("valor em estoque (custo × qtd)", () => {
    expect(r.stockValue).toBe(230); // 200 + 30 + 0
  });
  it("contagem de baixo e zerado", () => {
    expect(r.lowStock).toBe(1);
    expect(r.outOfStock).toBe(1);
  });
  it("margem potencial só com preço definido", () => {
    expect(r.potentialMargin).toBe(660); // 600 + 60
  });
});
