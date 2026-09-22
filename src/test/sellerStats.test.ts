import { describe, it, expect } from "vitest";
import { sellerComparison } from "@/lib/sellerStats";
import { buildAccessoryMap, buildDeviceMap } from "@/lib/profit";
import { Accessory, CartItem, Device, Sale } from "@/types/inventory";

const dev = (id: string, cost: number): Device => ({
  id, category: "iPhone", brand: "Apple", location: "Estoque", model: "iPhone", capacity: "128", color: "Preto",
  condition: "Lacrado", batteryHealth: 100, supplier: "", cost, serialImei: id, internalSerial: "",
  status: "Vendido", createdAt: new Date(),
});
const acc: Accessory = {
  id: "a1", name: "Capa", category: "Capas", subcategory: "Silicone", compatibleModel: "Universal",
  quantity: 10, minQuantity: 1, cost: 10, barcode: "X", createdAt: new Date(),
};

const sale = (id: string, seller: string, items: CartItem[]): Sale => {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  return {
    id, customer: { id: "c", name: "C", cpf: "", whatsapp: "", birthday: "", leadOrigin: "Instagram", createdAt: new Date() },
    items, payments: [], seller, subtotal, tradeInDiscount: 0, discount: 0, total: subtotal,
    giftsCost: 0, requiresInvoice: false, createdAt: new Date(),
  };
};
const dItem = (deviceId: string, price: number): CartItem => ({ id: deviceId, type: "device", deviceId, name: "iPhone", price, quantity: 1 });

const devicesById = buildDeviceMap([dev("d1", 3000), dev("d2", 4000), dev("d3", 1000)]);
const accById = buildAccessoryMap([acc]);

describe("sellerComparison", () => {
  const sales = [
    sale("s1", "Gabriel", [dItem("d1", 4000)]), // lucro 1000
    sale("s2", "Gabriel", [dItem("d2", 5500)]), // lucro 1500
    sale("s3", "Matheus", [dItem("d3", 3000)]), // lucro 2000
  ];
  const stats = sellerComparison(sales, devicesById, accById);

  it("agrupa por vendedor", () => {
    expect(stats.map((s) => s.seller).sort()).toEqual(["Gabriel", "Matheus"]);
  });
  it("calcula faturamento, lucro e médias", () => {
    const g = stats.find((s) => s.seller === "Gabriel")!;
    expect(g.salesCount).toBe(2);
    expect(g.revenue).toBe(9500);
    expect(g.avgTicket).toBe(4750);
    expect(g.profit).toBe(2500);
    expect(g.avgProfit).toBe(1250);
  });
  it("ordena por lucro (padrão)", () => {
    expect(stats[0].seller).toBe("Gabriel"); // 2500 > 2000
  });
  it("ordena por faturamento quando pedido", () => {
    expect(sellerComparison(sales, devicesById, accById, "revenue")[0].seller).toBe("Gabriel");
    const alt = [sale("x", "Ana", [dItem("d1", 9000)]), sale("y", "Bia", [dItem("d2", 5000)])];
    expect(sellerComparison(alt, devicesById, accById, "revenue")[0].seller).toBe("Ana");
  });
  it("acessório entra no lucro pelo custo real", () => {
    const s = sale("s9", "Ana", [{ id: "a", type: "accessory", accessoryId: "a1", name: "Capa", price: 100, quantity: 2 }]);
    const r = sellerComparison([s], devicesById, accById)[0];
    expect(r.revenue).toBe(200);
    expect(r.profit).toBe(180); // 200 - 2 x 10
  });
  it("venda sem vendedor entra como 'Sem vendedor'", () => {
    const r = sellerComparison([sale("z", "", [dItem("d1", 3500)])], devicesById, accById);
    expect(r[0].seller).toBe("Sem vendedor");
  });
  it("sem vendas devolve lista vazia", () => {
    expect(sellerComparison([], devicesById, accById)).toEqual([]);
  });
});
