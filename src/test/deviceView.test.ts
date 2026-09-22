import { describe, it, expect } from "vitest";
import {
  allBrands, allLocations, findDeviceByCode, matchesDeviceFilters, modelAge,
  sortDevices, sortKeepsGroups, stockCountProgress, summarizeByModel,
} from "@/lib/deviceView";
import { Device } from "@/types/inventory";

const mk = (over: Partial<Device>): Device => ({
  id: Math.random().toString(36).slice(2),
  category: "iPhone",
  brand: "Apple",
  location: "Estoque",
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
  createdAt: new Date("2026-01-01"),
  ...over,
});

const models = (list: Device[]) => list.map((d) => `${d.model} ${d.capacity}`);

describe("locais e marcas", () => {
  it("junta os padrões com os já usados, sem repetir", () => {
    const locs = allLocations([{ location: "Vitrine 1" }, { location: "Prateleira B" }]);
    expect(locs).toContain("Estoque");
    expect(locs).toContain("Assistência");
    expect(locs).toContain("Prateleira B");
    expect(locs.filter((l) => l === "Vitrine 1")).toHaveLength(1);
  });
  it("marcas: padrão + usadas", () => {
    const brands = allBrands([{ brand: "Realme" }, { brand: "Apple" }]);
    expect(brands).toContain("Realme");
    expect(brands.filter((b) => b === "Apple")).toHaveLength(1);
  });
});

describe("modelAge", () => {
  it("modelo mais novo tem idade menor", () => {
    expect(modelAge("iPhone", "iPhone 16 Pro")).toBeLessThan(modelAge("iPhone", "iPhone 12"));
  });
  it("modelo fora do catálogo é o mais 'velho' possível", () => {
    expect(modelAge("iPhone", "Galaxy S24")).toBeGreaterThan(modelAge("iPhone", "iPhone X"));
  });
});

describe("sortDevices", () => {
  const a = mk({ model: "iPhone 13", capacity: "256", salePrice: 4000, cost: 3000, batteryHealth: 88, createdAt: new Date("2026-03-01") });
  const b = mk({ model: "iPhone 15 Pro", capacity: "128", salePrice: 7000, cost: 5500, batteryHealth: 100, createdAt: new Date("2026-05-01") });
  const c = mk({ model: "iPhone 11", capacity: "64", salePrice: undefined, cost: 1800, batteryHealth: 79, createdAt: new Date("2026-02-01") });
  const d = mk({ model: "iPhone 13", capacity: "128", salePrice: 3500, cost: 2800, batteryHealth: 92, createdAt: new Date("2026-04-01") });
  const all = [a, b, c, d];

  it("A-Z por modelo e capacidade numérica", () => {
    expect(models(sortDevices(all, "alphabetical"))).toEqual([
      "iPhone 11 64", "iPhone 13 128", "iPhone 13 256", "iPhone 15 Pro 128",
    ]);
  });
  it("mais antigos → mais novos", () => {
    expect(models(sortDevices(all, "model_oldest_first"))).toEqual([
      "iPhone 11 64", "iPhone 13 128", "iPhone 13 256", "iPhone 15 Pro 128",
    ]);
  });
  it("mais novos → mais antigos", () => {
    expect(models(sortDevices(all, "model_newest_first"))).toEqual([
      "iPhone 15 Pro 128", "iPhone 13 128", "iPhone 13 256", "iPhone 11 64",
    ]);
  });
  it("modelo desconhecido vai para o fim nas duas direções", () => {
    const x = mk({ model: "Modelo Novo Sem Catálogo" });
    expect(sortDevices([x, b], "model_oldest_first")[1]).toBe(x);
    expect(sortDevices([x, b], "model_newest_first")[1]).toBe(x);
  });
  it("maior preço de venda deixa quem não tem preço por último", () => {
    const r = sortDevices(all, "sale_price_desc");
    expect(r[0]).toBe(b);
    expect(r[r.length - 1]).toBe(c);
  });
  it("menor preço de venda também deixa sem preço por último", () => {
    const r = sortDevices(all, "sale_price_asc");
    expect(r[0]).toBe(d);
    expect(r[r.length - 1]).toBe(c);
  });
  it("maior custo", () => {
    expect(sortDevices(all, "cost_price_desc")[0]).toBe(b);
  });
  it("maior bateria", () => {
    expect(sortDevices(all, "battery_desc")[0]).toBe(b);
    expect(sortDevices(all, "battery_desc")[3]).toBe(c);
  });
  it("entrada mais recente", () => {
    expect(sortDevices(all, "recent_entry")[0]).toBe(b);
  });
  it("entrada usa entryDate quando existe", () => {
    const old = mk({ createdAt: new Date("2026-06-01"), entryDate: new Date("2025-01-01") });
    const recent = mk({ createdAt: new Date("2026-01-01"), entryDate: new Date("2026-02-01") });
    expect(sortDevices([old, recent], "recent_entry")[0]).toBe(recent);
  });
  it("maior quantidade: modelo com mais unidades primeiro", () => {
    const r = sortDevices(all, "stock_qty_desc");
    expect(r[0].model).toBe("iPhone 13");
    expect(r[1].model).toBe("iPhone 13");
  });
  it("não altera o array original", () => {
    const copy = [...all];
    sortDevices(all, "sale_price_desc");
    expect(all).toEqual(copy);
  });
  it("separador de grupos só nas ordenações por modelo", () => {
    expect(sortKeepsGroups("alphabetical")).toBe(true);
    expect(sortKeepsGroups("model_oldest_first")).toBe(true);
    expect(sortKeepsGroups("sale_price_desc")).toBe(false);
    expect(sortKeepsGroups("battery_desc")).toBe(false);
  });
});

describe("matchesDeviceFilters", () => {
  const base = { tab: "active" as const };
  it("aba ativa exclui vendidos; aba vendidos só mostra vendidos", () => {
    expect(matchesDeviceFilters(mk({ status: "Vendido" }), base)).toBe(false);
    expect(matchesDeviceFilters(mk({ status: "Vendido" }), { tab: "sold" })).toBe(true);
    expect(matchesDeviceFilters(mk({ status: "Disponível" }), { tab: "sold" })).toBe(false);
  });
  it("status só vale na aba ativa", () => {
    expect(matchesDeviceFilters(mk({ status: "Reservado" }), { ...base, status: "Reservado" })).toBe(true);
    expect(matchesDeviceFilters(mk({ status: "Disponível" }), { ...base, status: "Reservado" })).toBe(false);
  });
  it("marca, condição, local e categoria", () => {
    const d = mk({ brand: "Samsung", condition: "Seminovo", location: "Vitrine 2", category: "Celular" });
    expect(matchesDeviceFilters(d, { ...base, brand: "Samsung", condition: "Seminovo", location: "Vitrine 2", category: "Celular" })).toBe(true);
    expect(matchesDeviceFilters(d, { ...base, brand: "Apple" })).toBe(false);
    expect(matchesDeviceFilters(d, { ...base, condition: "Lacrado" })).toBe(false);
    expect(matchesDeviceFilters(d, { ...base, location: "Estoque" })).toBe(false);
  });
  it("'all' e vazio não filtram", () => {
    expect(matchesDeviceFilters(mk({}), { ...base, brand: "all", condition: "all", location: "all", status: "all" })).toBe(true);
  });
  it("busca por IMEI 2, serial, marca e local", () => {
    const d = mk({ imei2: "359000000000009", serial: "F2LABC", brand: "Samsung", location: "Vitrine 1" });
    for (const q of ["359000000000009", "f2labc", "samsung", "vitrine 1"]) {
      expect(matchesDeviceFilters(d, { ...base, search: q })).toBe(true);
    }
    expect(matchesDeviceFilters(d, { ...base, search: "xiaomi" })).toBe(false);
  });
  it("busca ignora espaços no código", () => {
    expect(matchesDeviceFilters(mk({ serialImei: "3590 0000 0000 001" }), { ...base, search: "359000000000001" })).toBe(true);
  });
  it("aparelho antigo sem marca/local conta como Apple/Estoque", () => {
    const legacy = { ...mk({}), brand: "", location: "" } as Device;
    expect(matchesDeviceFilters(legacy, { ...base, brand: "Apple", location: "Estoque" })).toBe(true);
  });
});

describe("findDeviceByCode", () => {
  const d1 = mk({ serialImei: "111", imei2: "222", serial: "SER-1", internalSerial: "INT-2026-0001" });
  const sold = mk({ serialImei: "999", status: "Vendido" });
  it("acha por IMEI 1, IMEI 2, serial e serial interno", () => {
    for (const code of ["111", "222", "ser-1", "INT-2026-0001"]) {
      expect(findDeviceByCode([d1, sold], code)).toBe(d1);
    }
  });
  it("ignora espaços e maiúsculas", () => {
    expect(findDeviceByCode([d1], " s e r - 1 ")).toBe(d1);
  });
  it("não devolve aparelho vendido", () => {
    expect(findDeviceByCode([sold], "999")).toBeUndefined();
  });
  it("código vazio ou desconhecido = undefined", () => {
    expect(findDeviceByCode([d1], "")).toBeUndefined();
    expect(findDeviceByCode([d1], "000")).toBeUndefined();
  });
  it("com duplicidade prefere o disponível", () => {
    const reservado = mk({ serialImei: "555", status: "Reservado" });
    const disp = mk({ serialImei: "555", status: "Disponível" });
    expect(findDeviceByCode([reservado, disp], "555")).toBe(disp);
  });
});

describe("summarizeByModel", () => {
  const list = [
    mk({ model: "iPhone 15", capacity: "128", cost: 5000, salePrice: 6500, batteryHealth: 100 }),
    mk({ model: "iPhone 15", capacity: "128", cost: 5100, salePrice: 6700, batteryHealth: 90 }),
    mk({ model: "iPhone 15", capacity: "256", cost: 6000, salePrice: 7500 }),
    mk({ model: "iPhone 15", capacity: "128", condition: "Seminovo", cost: 4000, batteryHealth: 85 }),
  ];
  const groups = summarizeByModel(list);
  it("separa por modelo, capacidade e condição", () => {
    expect(groups).toHaveLength(3);
  });
  it("ordena por modelo e capacidade numérica", () => {
    expect(groups.map((g) => `${g.capacity}${g.condition[0]}`)).toEqual(["128L", "128S", "256L"]);
  });
  it("soma quantidade, custo e média de bateria", () => {
    const g = groups.find((x) => x.capacity === "128" && x.condition === "Lacrado")!;
    expect(g.qty).toBe(2);
    expect(g.totalCost).toBe(10100);
    expect(g.avgBattery).toBe(95);
    expect(g.minPrice).toBe(6500);
    expect(g.maxPrice).toBe(6700);
  });
  it("sem preço fica null", () => {
    const g = groups.find((x) => x.condition === "Seminovo")!;
    expect(g.minPrice).toBeNull();
    expect(g.maxPrice).toBeNull();
  });
  it("marcas diferentes não se misturam", () => {
    const r = summarizeByModel([mk({ brand: "Apple", model: "X" }), mk({ brand: "Samsung", model: "X" })]);
    expect(r).toHaveLength(2);
  });
});

describe("stockCountProgress", () => {
  const list = [
    mk({ location: "Estoque", checkedAt: new Date() }),
    mk({ location: "Estoque" }),
    mk({ location: "Vitrine 1" }),
    mk({ location: "Vitrine 1", checkedAt: new Date() }),
    mk({ location: "Estoque", status: "Vendido" }),
  ];
  it("conta só não vendidos", () => {
    const p = stockCountProgress(list);
    expect(p.total).toBe(4);
    expect(p.checked).toBe(2);
    expect(p.missing).toHaveLength(2);
  });
  it("filtra por local", () => {
    const p = stockCountProgress(list, "Vitrine 1");
    expect(p.total).toBe(2);
    expect(p.checked).toBe(1);
  });
  it("lista vazia não quebra", () => {
    expect(stockCountProgress([])).toEqual({ total: 0, checked: 0, missing: [] });
  });
});
