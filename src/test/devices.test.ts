import { describe, it, expect } from "vitest";
import {
  daysInStock, deviceMargin, deviceMarginPct, buildStockReport,
  capacityInGB, deviceGroupKey, sortDevicesByModel,
} from "@/lib/devices";
import { formatCapacity } from "@/lib/utils";
import { Device } from "@/types/inventory";

const mkDevice = (over: Partial<Device>): Device => ({
  id: Math.random().toString(),
  category: "iPhone",
  model: "iPhone 15",
  capacity: "128",
  color: "Preto",
  condition: "Lacrado",
  batteryHealth: 100,
  supplier: "",
  cost: 5000,
  salePrice: undefined,
  serialImei: "",
  internalSerial: "",
  status: "Disponível",
  createdAt: new Date(),
  ...over,
});

describe("formatCapacity", () => {
  it("acrescenta GB quando é número puro", () => {
    expect(formatCapacity("128")).toBe("128GB");
  });
  it("mantém valores não-numéricos (Watch/Mac)", () => {
    expect(formatCapacity("45mm")).toBe("45mm");
    expect(formatCapacity("1TB")).toBe("1TB");
  });
  it("vazio retorna vazio", () => {
    expect(formatCapacity("")).toBe("");
  });
});

describe("margem do aparelho", () => {
  it("margem em R$ e %", () => {
    const d = mkDevice({ cost: 5000, salePrice: 6000 });
    expect(deviceMargin(d)).toBe(1000);
    expect(deviceMarginPct(d)).toBe(20);
  });
  it("sem preço de venda → null", () => {
    const d = mkDevice({ cost: 5000, salePrice: undefined });
    expect(deviceMargin(d)).toBeNull();
    expect(deviceMarginPct(d)).toBeNull();
  });
  it("margem negativa (vende abaixo do custo)", () => {
    const d = mkDevice({ cost: 5000, salePrice: 4500 });
    expect(deviceMargin(d)).toBe(-500);
  });
});

describe("dias em estoque", () => {
  it("conta os dias desde o cadastro", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    expect(daysInStock(tenDaysAgo)).toBe(10);
  });
  it("data futura não fica negativa", () => {
    const future = new Date(Date.now() + 86_400_000);
    expect(daysInStock(future)).toBe(0);
  });
});

describe("relatório de estoque", () => {
  const devices = [
    mkDevice({ status: "Disponível", category: "iPhone", cost: 5000, salePrice: 6000 }),
    mkDevice({ status: "Reservado", category: "iPad", cost: 4000, salePrice: 5000 }),
    mkDevice({ status: "Vendido", category: "iPhone", cost: 3000 }),
    mkDevice({ status: "Em Manutenção", category: "Mac", cost: 8000 }),
  ];
  const r = buildStockReport(devices);

  it("contagens por status", () => {
    expect(r.total).toBe(4);
    expect(r.inStock).toBe(2); // Disponível + Reservado
    expect(r.sold).toBe(1);
    expect(r.maintenance).toBe(1);
  });
  it("valor em estoque soma só os em loja", () => {
    expect(r.stockValue).toBe(9000); // 5000 + 4000
  });
  it("margem potencial soma só os em loja com preço", () => {
    expect(r.potentialMargin).toBe(2000); // (6000-5000) + (5000-4000)
  });
  it("quebra por categoria", () => {
    expect(r.byCategory).toEqual({ iPhone: 2, iPad: 1, Mac: 1 });
  });
});

describe("capacityInGB", () => {
  it("numero puro = GB", () => expect(capacityInGB("128")).toBe(128));
  it("com sufixo GB", () => expect(capacityInGB("256GB")).toBe(256));
  it("TB vira GB (×1024)", () => expect(capacityInGB("1TB")).toBe(1024));
  it("vazio = 0", () => expect(capacityInGB("")).toBe(0));
});

describe("deviceGroupKey", () => {
  it("mesmo modelo + capacidade = mesma chave", () => {
    const a = mkDevice({ model: "iPhone 13", capacity: "128" });
    const b = mkDevice({ model: "iPhone 13", capacity: "128" });
    expect(deviceGroupKey(a)).toBe(deviceGroupKey(b));
  });
  it("capacidade diferente = chave diferente", () => {
    const a = mkDevice({ model: "iPhone 13", capacity: "128" });
    const b = mkDevice({ model: "iPhone 13", capacity: "256" });
    expect(deviceGroupKey(a)).not.toBe(deviceGroupKey(b));
  });
});

describe("sortDevicesByModel", () => {
  it("ordena por modelo e depois por capacidade (numerico, nao alfabetico)", () => {
    const devices = [
      mkDevice({ model: "iPhone 13", capacity: "512" }),
      mkDevice({ model: "iPhone 13", capacity: "64" }),
      mkDevice({ model: "iPhone 13", capacity: "128" }),
      mkDevice({ model: "iPhone 13", capacity: "256" }),
      mkDevice({ model: "iPhone 11", capacity: "64" }),
    ];
    const sorted = sortDevicesByModel(devices).map((d) => `${d.model} ${d.capacity}`);
    expect(sorted).toEqual([
      "iPhone 11 64",
      "iPhone 13 64",
      "iPhone 13 128",
      "iPhone 13 256",
      "iPhone 13 512",
    ]);
  });
});
