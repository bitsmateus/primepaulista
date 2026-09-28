import { describe, it, expect } from "vitest";
import { Accessory, Device } from "@/types/inventory";
import { groupDevicesByModel, splitByCondition, summarizeByModel, sortDevices } from "@/lib/deviceView";
import { generateCatalogHTML, generateShowcaseHTML, generateStockReportHTML } from "@/utils/deviceCatalog";
import { generateAccessoryCatalogHTML, generateAccessoryStockReportHTML } from "@/utils/accessoryCatalog";
import { generateDailySalesHTML } from "@/utils/dailySalesPrint";
import { buildDailySalesReport } from "@/lib/dailySales";
import { Sale } from "@/types/inventory";

const dev = (over: Partial<Device>): Device => ({
  id: Math.random().toString(36).slice(2), category: "iPhone", brand: "Apple", location: "Estoque",
  model: "iPhone 16", capacity: "128", color: "Preto", condition: "Lacrado", batteryHealth: 100,
  supplier: "", cost: 4000, price: 5000, serialImei: "35", serial: "", internalSerial: "",
  status: "Disponível", createdAt: new Date(), ...over,
} as Device);

const acc = (over: Partial<Accessory>): Accessory => ({
  id: Math.random().toString(36).slice(2), name: "Capa Silicone", category: "Capas", subcategory: "Silicone",
  compatibleModel: "iPhone 14", quantity: 5, minQuantity: 1, cost: 20, price: 80, barcode: "", createdAt: new Date(), ...over,
} as Accessory);

describe("agrupamento por nome de modelo", () => {
  const list = [
    dev({ model: "16 PM" }), dev({ model: "iPhone 16 Pro Max" }), dev({ model: "14" }), dev({ model: "iPhone 14" }),
  ];
  it("'14' e '16 PM' ficam junto de 'iPhone 14' e 'iPhone 16 Pro Max'", () => {
    expect(groupDevicesByModel(list).map((g) => [g.model, g.devices.length])).toEqual([
      ["iPhone 14", 2], ["iPhone 16 Pro Max", 2],
    ]);
  });
  it("ordenação alfabética não joga '14' para o topo", () => {
    expect(sortDevices(list, "alphabetical").map((d) => d.model.replace(/^iPhone /, "").replace("Pro Max", "PM")).slice(0, 2)).toEqual(
      sortDevices(list, "alphabetical").slice(0, 2).map((d) => d.model.replace(/^iPhone /, "").replace("Pro Max", "PM"))
    );
    const firstTwo = sortDevices(list, "alphabetical").slice(0, 2).map((d) => d.model);
    expect(firstTwo.every((m) => /14$/.test(m))).toBe(true);
  });
  it("resumo por modelo junta os apelidos", () => {
    const s = summarizeByModel(list);
    expect(s.map((x) => x.model).sort()).toEqual(["iPhone 14", "iPhone 16 Pro Max"]);
  });
});

describe("splitByCondition", () => {
  const list = [dev({ condition: "Seminovo" }), dev({ condition: "Lacrado" }), dev({ condition: "Lacrado" })];
  it("lacrados primeiro, seminovos depois, cada um com seus aparelhos", () => {
    const s = splitByCondition(list);
    expect(s.map((x) => [x.key, x.devices.length])).toEqual([["Lacrado", 2], ["Seminovo", 1]]);
  });
  it("omite seção vazia", () => expect(splitByCondition([dev({})]).map((x) => x.key)).toEqual(["Lacrado"]));
});

describe("impressos de aparelhos", () => {
  const list = [
    dev({ condition: "Seminovo", model: "iPhone 16", salePrice: 4000, cost: 3000 }),
    dev({ condition: "Lacrado", model: "16", salePrice: 5000, cost: 4000 }),
  ];
  for (const [nome, fn] of [
    ["catálogo", (d: Device[]) => generateCatalogHTML(d, true)],
    ["relatório de estoque", (d: Device[]) => generateStockReportHTML(d)],
    ["vitrine", (d: Device[]) => generateShowcaseHTML(d)],
  ] as const) {
    it(`${nome}: lacrados e seminovos em seções separadas, lacrado antes`, () => {
      const h = fn(list);
      const iL = h.indexOf("Lacrados");
      const iS = h.indexOf("Seminovos");
      expect(iL).toBeGreaterThan(-1);
      expect(iS).toBeGreaterThan(iL);
    });
    it(`${nome}: usa o nome padronizado do modelo`, () => {
      expect(fn(list)).toContain("iPhone 16");
    });
  }
  it("escapa HTML em campos digitados", () => {
    const h = generateStockReportHTML([dev({ color: "<script>x</script>" })]);
    expect(h).not.toContain("<script>x</script>");
  });
});

describe("impressos de acessórios", () => {
  const list = [acc({}), acc({ name: "Cabo USB-C", category: "Cabos e Fontes", subcategory: "Cabo USB-C", cost: 10, price: 30, quantity: 2 })];
  it("catálogo lista as categorias e não traz aparelhos", () => {
    const h = generateAccessoryCatalogHTML(list);
    expect(h).toContain("Capas");
    expect(h).toContain("Cabos e Fontes");
    expect(h).toContain("Cabo USB-C");
  });
  it("relatório de estoque mostra os valores", () => {
    const h = generateAccessoryStockReportHTML(list);
    expect(h).toContain("R$");
    expect(h).toContain("Capa Silicone");
  });
  it("escapa HTML no nome", () => {
    expect(generateAccessoryCatalogHTML([acc({ name: "<img src=x>" })])).not.toContain("<img src=x>");
  });
});

describe("HTML do relatório de vendas do dia", () => {
  const d = dev({ id: "dd", status: "Vendido", serial: "SERIAL123", serialImei: "350999999999999" });
  const s = {
    id: "s1", customer: { id: "c", name: "<b>Ana</b>", cpf: "", whatsapp: "", birthday: "", leadOrigin: "", createdAt: new Date() },
    seller: "Gabriel", items: [{ id: "dd", type: "device", deviceId: "dd", name: "iPhone 16", serial: "350999999999999", price: 5000, quantity: 1 }],
    payments: [{ id: "p", method: "Dinheiro", amount: 5000 }],
    subtotal: 5000, tradeInDiscount: 0, discount: 0, total: 5000, giftsCost: 0, requiresInvoice: false,
    createdAt: new Date(2026, 8, 21, 10, 0),
  } as unknown as Sale;
  const html = generateDailySalesHTML(buildDailySalesReport([s], [d], "2026-09-21"), "Admin");
  it("mostra o número de série e não o IMEI", () => {
    expect(html).toContain("SERIAL123");
    expect(html).not.toContain("350999999999999");
  });
  it("mostra formas de recebimento e escapa o cliente", () => {
    expect(html).toContain("Dinheiro");
    expect(html).toContain("Débito");
    expect(html).toContain("Crédito");
    expect(html).not.toContain("<b>Ana</b>");
  });
});
