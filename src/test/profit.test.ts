import { describe, it, expect } from "vitest";
import {
  buildDeviceMap, buildAccessoryMap, itemCost, saleCogs, saleGrossProfit, salesGrossProfit,
  saleDeviceSaleValue, saleNetProfit,
} from "@/lib/profit";
import { Sale, Device, Accessory, Customer, CartItem } from "@/types/inventory";

const mkCustomer = (): Customer => ({
  id: "c1", name: "João", cpf: "", whatsapp: "", birthday: "",
  leadOrigin: "Instagram", createdAt: new Date(),
});

const device: Device = {
  id: "d1", category: "iPhone", model: "iPhone 15", capacity: "128", color: "Preto",
  condition: "Seminovo", batteryHealth: 90, serialImei: "ABC", internalSerial: "INT-1",
  supplier: "", cost: 3000, salePrice: 5000, status: "Vendido", createdAt: new Date(),
} as Device;

const accessory: Accessory = {
  id: "a1", name: "Capa", category: "Proteção", subcategory: "Capa", compatibleModel: "Universal",
  barcode: "ACC-1", cost: 20, price: 100, quantity: 10, minQuantity: 2, createdAt: new Date(),
} as Accessory;

const devById = buildDeviceMap([device]);
const accById = buildAccessoryMap([accessory]);

const deviceItem: CartItem = { id: "i1", type: "device", deviceId: "d1", name: "iPhone 15", serial: "ABC", price: 5000, quantity: 1 };
const accItem: CartItem = { id: "i2", type: "accessory", accessoryId: "a1", name: "Capa", price: 100, quantity: 2 };

const mkSale = (over: Partial<Sale>): Sale => ({
  id: "s1", customer: mkCustomer(), items: [], payments: [],
  seller: "Gabriel" as Sale["seller"], subtotal: 0, tradeInDiscount: 0,
  discount: 0, total: 0, giftsCost: 0, requiresInvoice: false, createdAt: new Date(), ...over,
});

describe("custo do item (COGS)", () => {
  it("usa o custo real do aparelho", () => {
    expect(itemCost(deviceItem, devById, accById)).toBe(3000);
  });
  it("usa o custo real do acessório × quantidade", () => {
    expect(itemCost(accItem, devById, accById)).toBe(40);
  });
  it("item sem cadastro correspondente custa 0", () => {
    expect(itemCost({ ...deviceItem, deviceId: "x" }, devById, accById)).toBe(0);
  });
});

describe("margem bruta da venda", () => {
  it("receita − custo real (device + acessório)", () => {
    // total 5200, custo 3000 + 40 = 3040 → margem 2160
    const sale = mkSale({ items: [deviceItem, accItem], total: 5200 });
    expect(saleCogs(sale, devById, accById)).toBe(3040);
    expect(saleGrossProfit(sale, devById, accById)).toBe(2160);
  });

  it("desconto/troca já estão no total, então entram exatos", () => {
    // mesmo conteúdo, mas com R$200 de desconto no total
    const sale = mkSale({ items: [deviceItem, accItem], subtotal: 5200, discount: 200, total: 5000 });
    expect(saleGrossProfit(sale, devById, accById)).toBe(5000 - 3040);
  });

  it("venda devolvida não gera margem", () => {
    const sale = mkSale({ items: [deviceItem], total: 5000, returnedAt: new Date() });
    expect(saleGrossProfit(sale, devById, accById)).toBe(0);
  });
});

describe("lucro líquido da venda", () => {
  it("valor total (sem descontar troca) − custo dos produtos − brindes", () => {
    // aparelho 5000 (custo 3000) + capa 200 (custo 40), 100 de brinde
    const sale = mkSale({ items: [deviceItem, accItem], subtotal: 5200, total: 5200, giftsCost: 100 });
    expect(saleNetProfit(sale, devById, accById)).toBe(5200 - 3040 - 100);
  });

  it("troca não é tratada como custo: usa o valor cheio da venda, não o total líquido", () => {
    // mesmo aparelho, mas com troca de 3000 de crédito (cliente paga só 2200)
    const sale = mkSale({
      items: [deviceItem, accItem], subtotal: 5200, tradeInDiscount: 3000, total: 2200,
    });
    expect(saleNetProfit(sale, devById, accById)).toBe(5200 - 3040);
  });

  it("nota fiscal exigida: desconta 0,5% do valor do aparelho (não do acessório)", () => {
    const sale = mkSale({ items: [deviceItem, accItem], subtotal: 5200, total: 5200, requiresInvoice: true });
    expect(saleDeviceSaleValue(sale)).toBe(5000);
    expect(saleNetProfit(sale, devById, accById)).toBe(5200 - 3040 - 5000 * 0.005);
  });

  it("venda devolvida não gera lucro líquido", () => {
    const sale = mkSale({ items: [deviceItem], total: 5000, returnedAt: new Date() });
    expect(saleNetProfit(sale, devById, accById)).toBe(0);
  });
});

describe("margem de um conjunto de vendas", () => {
  it("soma ignorando as devolvidas", () => {
    const sales = [
      mkSale({ id: "a", items: [deviceItem], total: 5000 }), // 2000
      mkSale({ id: "b", items: [accItem], total: 200 }),       // 160
      mkSale({ id: "c", items: [deviceItem], total: 5000, returnedAt: new Date() }), // 0
    ];
    expect(salesGrossProfit(sales, devById, accById)).toBe(2160);
  });
});
