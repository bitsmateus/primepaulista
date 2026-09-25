import { Device, DeviceCategory } from "@/types/inventory";
import { DEVICE_CATEGORIES, MODELS_BY_CATEGORY } from "@/data/appleCatalog";
import { capacityInGB, daysInStock } from "@/lib/devices";
import { canonicalModel, modelGroupKey } from "@/lib/modelName";

// Localização, ordenação, filtros, resumo por modelo e balanço de estoque
// da tela de Aparelhos. Só lógica pura (sem React), para ser testável.

export const DEFAULT_LOCATIONS = ["Estoque", "Vitrine 1", "Vitrine 2", "Assistência"];
export const DEFAULT_BRANDS = ["Apple", "Samsung", "Xiaomi", "Motorola", "Outra"];

// Locais padrão + os já usados em algum aparelho
export function allLocations(devices: Pick<Device, "location">[]): string[] {
  const set = new Set<string>(DEFAULT_LOCATIONS);
  devices.forEach((d) => d.location && set.add(d.location));
  return [...set];
}

export function allBrands(devices: Pick<Device, "brand">[]): string[] {
  const set = new Set<string>(DEFAULT_BRANDS);
  devices.forEach((d) => d.brand && set.add(d.brand));
  return [...set];
}

export type DeviceSortKey =
  | "alphabetical"
  | "model_oldest_first"
  | "model_newest_first"
  | "sale_price_desc"
  | "sale_price_asc"
  | "cost_price_desc"
  | "stock_qty_desc"
  | "battery_desc"
  | "recent_entry";

export const DEVICE_SORT_OPTIONS: { value: DeviceSortKey; label: string; adminOnly?: boolean }[] = [
  { value: "alphabetical", label: "Nome do modelo (A-Z)" },
  { value: "model_oldest_first", label: "Modelos mais antigos → mais novos" },
  { value: "model_newest_first", label: "Modelos mais novos → mais antigos" },
  { value: "sale_price_desc", label: "Maior preço de venda" },
  { value: "sale_price_asc", label: "Menor preço de venda" },
  { value: "cost_price_desc", label: "Maior custo de compra", adminOnly: true },
  { value: "stock_qty_desc", label: "Maior quantidade" },
  { value: "battery_desc", label: "Maior saúde de bateria" },
  { value: "recent_entry", label: "Entrada mais recente" },
];

// Ordenações em que aparelhos do mesmo modelo/capacidade ficam juntos
// (só nelas faz sentido a linha em branco entre grupos).
export function sortKeepsGroups(key: DeviceSortKey): boolean {
  return (
    key === "alphabetical" ||
    key === "model_oldest_first" ||
    key === "model_newest_first" ||
    key === "stock_qty_desc"
  );
}

const UNKNOWN_AGE = Number.MAX_SAFE_INTEGER;

// "Idade" do modelo: posição no catálogo (0 = mais novo). Modelos fora do
// catálogo recebem UNKNOWN_AGE e ficam sempre depois dos conhecidos.
export function modelAge(category: string, model: string): number {
  const list = MODELS_BY_CATEGORY[category as DeviceCategory] ?? [];
  const idx = list.indexOf(model);
  return idx >= 0 ? idx : UNKNOWN_AGE;
}

const categoryOrder = (c: string) => {
  const i = DEVICE_CATEGORIES.indexOf((c || "iPhone") as DeviceCategory);
  return i >= 0 ? i : DEVICE_CATEGORIES.length;
};
const entryTime = (d: Device) => new Date(d.entryDate ?? d.createdAt).getTime();

const byModelThenCapacity = (a: Device, b: Device) => {
  const m = canonicalModel(a.category, a.model).localeCompare(canonicalModel(b.category, b.model), "pt-BR");
  return m !== 0 ? m : capacityInGB(a.capacity) - capacityInGB(b.capacity);
};

// dir = 1: mais antigos primeiro; dir = -1: mais novos primeiro
const byModelAge = (dir: 1 | -1) => (a: Device, b: Device) => {
  const c = categoryOrder(a.category) - categoryOrder(b.category);
  if (c !== 0) return c;
  const ageA = modelAge(a.category, canonicalModel(a.category, a.model));
  const ageB = modelAge(b.category, canonicalModel(b.category, b.model));
  if (ageA !== ageB) {
    if (ageA === UNKNOWN_AGE) return 1;
    if (ageB === UNKNOWN_AGE) return -1;
    return dir === 1 ? ageB - ageA : ageA - ageB;
  }
  return byModelThenCapacity(a, b);
};

export function sortDevices(devices: Device[], key: DeviceSortKey): Device[] {
  const list = [...devices];
  switch (key) {
    case "model_oldest_first":
      return list.sort(byModelAge(1));
    case "model_newest_first":
      return list.sort(byModelAge(-1));
    case "sale_price_desc": // sem preço vai para o fim
      return list.sort((a, b) => (b.salePrice ?? -1) - (a.salePrice ?? -1) || byModelThenCapacity(a, b));
    case "sale_price_asc":
      return list.sort(
        (a, b) => (a.salePrice ?? Infinity) - (b.salePrice ?? Infinity) || byModelThenCapacity(a, b)
      );
    case "cost_price_desc":
      return list.sort((a, b) => b.cost - a.cost || byModelThenCapacity(a, b));
    case "stock_qty_desc": {
      const qty = new Map<string, number>();
      const gk = (d: Device) => modelGroupKey(d.category, d.model);
      for (const d of list) qty.set(gk(d), (qty.get(gk(d)) ?? 0) + 1);
      return list.sort((a, b) => qty.get(gk(b))! - qty.get(gk(a))! || byModelThenCapacity(a, b));
    }
    case "battery_desc":
      return list.sort((a, b) => b.batteryHealth - a.batteryHealth || byModelThenCapacity(a, b));
    case "recent_entry":
      return list.sort((a, b) => entryTime(b) - entryTime(a));
    case "alphabetical":
    default:
      return list.sort(byModelThenCapacity);
  }
}

export interface DeviceFilters {
  tab: "active" | "sold";
  search?: string;
  category?: string; // "all" ou nome
  brand?: string;
  condition?: string;
  status?: string;
  location?: string;
}

const isAll = (v?: string) => !v || v === "all";
const normCode = (v: string) => v.replace(/\s+/g, "").toLowerCase();

export function matchesDeviceFilters(d: Device, f: DeviceFilters): boolean {
  if (f.tab === "sold") {
    if (d.status !== "Vendido") return false;
  } else {
    if (d.status === "Vendido") return false;
    if (!isAll(f.status) && d.status !== f.status) return false;
  }
  if (!isAll(f.category) && (d.category || "iPhone") !== f.category) return false;
  if (!isAll(f.brand) && (d.brand || "Apple") !== f.brand) return false;
  if (!isAll(f.condition) && d.condition !== f.condition) return false;
  if (!isAll(f.location) && (d.location || "Estoque") !== f.location) return false;
  const q = (f.search ?? "").trim().toLowerCase();
  if (q) {
    const hay = [
      d.model, d.brand, d.color, d.capacity, d.location, d.supplier,
      d.serialImei, d.imei2, d.serial, d.internalSerial,
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q) && !hay.replace(/\s+/g, "").includes(normCode(q))) return false;
  }
  return true;
}

// Acha um aparelho pelo código lido (IMEI 1, IMEI 2, serial ou serial interno).
// Só considera aparelhos não vendidos; quando há mais de um, prefere o disponível.
export function findDeviceByCode(devices: Device[], code: string): Device | undefined {
  const c = normCode(code);
  if (!c) return undefined;
  const hits = devices.filter(
    (d) =>
      d.status !== "Vendido" &&
      [d.serialImei, d.imei2, d.serial, d.internalSerial].some((v) => !!v && normCode(v) === c)
  );
  return hits.find((d) => d.status === "Disponível") ?? hits[0];
}

export interface ModelSummary {
  key: string;
  category: string;
  brand: string;
  model: string;
  capacity: string;
  condition: Device["condition"];
  qty: number;
  minPrice: number | null;
  maxPrice: number | null;
  avgBattery: number;
  totalCost: number;
  maxDays: number;
  devices: Device[];
}

// Resumo por modelo + capacidade + condição (o "Resumo por Modelo" da tela)
export function summarizeByModel(devices: Device[]): ModelSummary[] {
  const map = new Map<string, ModelSummary>();
  for (const d of devices) {
    const key = [d.category || "iPhone", d.brand || "Apple", modelGroupKey(d.category, d.model), d.capacity, d.condition].join("|");
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        category: d.category || "iPhone",
        brand: d.brand || "Apple",
        model: canonicalModel(d.category, d.model) || d.model,
        capacity: d.capacity,
        condition: d.condition,
        qty: 0,
        minPrice: null,
        maxPrice: null,
        avgBattery: 0,
        totalCost: 0,
        maxDays: 0,
        devices: [],
      };
      map.set(key, g);
    }
    g.qty++;
    g.devices.push(d);
    g.totalCost += d.cost || 0;
    g.avgBattery += d.batteryHealth;
    g.maxDays = Math.max(g.maxDays, daysInStock(d.entryDate ?? d.createdAt));
    if (d.salePrice != null) {
      g.minPrice = g.minPrice == null ? d.salePrice : Math.min(g.minPrice, d.salePrice);
      g.maxPrice = g.maxPrice == null ? d.salePrice : Math.max(g.maxPrice, d.salePrice);
    }
  }
  const out = [...map.values()].map((g) => ({ ...g, avgBattery: Math.round(g.avgBattery / g.qty) }));
  return out.sort((a, b) => {
    const m = a.model.localeCompare(b.model, "pt-BR");
    if (m !== 0) return m;
    const c = capacityInGB(a.capacity) - capacityInGB(b.capacity);
    return c !== 0 ? c : a.condition.localeCompare(b.condition);
  });
}

export interface StockCountProgress {
  total: number; // aparelhos que deveriam ser conferidos
  checked: number;
  missing: Device[]; // ainda não conferidos
}

// Progresso do balanço: considera todo aparelho não vendido (opcionalmente de um local)
export function stockCountProgress(devices: Device[], location?: string): StockCountProgress {
  const scope = devices.filter(
    (d) => d.status !== "Vendido" && (isAll(location) || (d.location || "Estoque") === location)
  );
  const missing = scope.filter((d) => !d.checkedAt);
  return { total: scope.length, checked: scope.length - missing.length, missing };
}

// ---------------------------------------------------------------------------
// Estoque separado por condição (lacrado x seminovo)
// ---------------------------------------------------------------------------

export const CONDITION_SECTIONS: { key: Device["condition"]; title: string; short: string }[] = [
  { key: "Lacrado", title: "Aparelhos lacrados (novos)", short: "Lacrados" },
  { key: "Seminovo", title: "Aparelhos seminovos", short: "Seminovos" },
];

export interface ConditionSection {
  key: Device["condition"];
  title: string;
  short: string;
  devices: Device[];
}

// Separa os aparelhos em seções por condição (Lacrado primeiro). Só devolve seções com aparelhos.
export function splitByCondition(devices: Device[]): ConditionSection[] {
  return CONDITION_SECTIONS.map((s) => ({ ...s, devices: devices.filter((d) => d.condition === s.key) })).filter(
    (s) => s.devices.length > 0
  );
}

// Agrupa por modelo (nome padronizado: "14" e "iPhone 14" juntos), em ordem alfabética,
// e dentro de cada modelo por capacidade numérica.
export function groupDevicesByModel(devices: Device[]): { model: string; devices: Device[] }[] {
  const groups = new Map<string, { model: string; devices: Device[] }>();
  for (const d of devices) {
    const key = modelGroupKey(d.category, d.model);
    let g = groups.get(key);
    if (!g) {
      g = { model: canonicalModel(d.category, d.model) || "Sem modelo", devices: [] };
      groups.set(key, g);
    }
    g.devices.push(d);
  }
  return [...groups.values()]
    .sort((a, b) => a.model.localeCompare(b.model, "pt-BR"))
    .map((g) => ({
      model: g.model,
      devices: [...g.devices].sort((a, b) => capacityInGB(a.capacity) - capacityInGB(b.capacity) || (a.color || "").localeCompare(b.color || "", "pt-BR")),
    }));
}
