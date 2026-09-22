// Escolha do estoque relevante para a pergunta (só aparelhos DISPONÍVEIS, só dados comerciais). Arquivo puro.
// NUNCA entram custo, fornecedor, IMEI/serial, observações internas ou margem: o tipo abaixo nem tem esses campos.

import { fmtBRL } from "./aiPrivacy";

export interface StockDevice {
  model: string;
  capacity: string;
  color: string;
  condition: string;
  batteryHealth: number | null;
  salePrice: number | null;
}

export interface StockLine {
  model: string;
  capacity: string;
  color: string;
  condition: string;
  battery: number | null;
  price: number | null;
}

export interface StockSelection {
  items: StockLine[];
  total: number; // quantos aparelhos casaram (antes do limite)
  modelHit: boolean; // a pergunta citou um modelo do estoque
  catalog: { model: string; capacity: string; from: number | null; count: number }[]; // resumo quando não citou modelo
}

const norm = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const BRANDS = new Set(["iphone", "ipad", "apple", "galaxy", "samsung", "watch", "macbook", "airpods", "xiaomi", "redmi", "motorola", "moto"]);

// "iphone15" -> "iphone 15", "15pro" -> "15 pro" (o cliente escreve junto)
function spaceOut(s: string): string {
  return s.replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2");
}

export function selectStock(message: string, devices: StockDevice[], limit = 8): StockSelection {
  const msgNorm = spaceOut(norm(message));
  const msgTokens = new Set(msgNorm.split(" ").filter(Boolean));
  const modelSets = new Map<string, Set<string>>();
  for (const d of devices) {
    if (!modelSets.has(d.model)) modelSets.set(d.model, new Set(spaceOut(norm(d.model)).split(" ").filter(Boolean)));
  }
  // modelos cujo nome aparece na pergunta
  const matched: string[] = [];
  for (const [model, toks] of modelSets) {
    const all = [...toks];
    if (all.length === 0) continue;
    const strict = all.every((t) => msgTokens.has(t));
    const rest = all.filter((t) => !BRANDS.has(t));
    const loose = !all.some((t) => BRANDS.has(t) && msgTokens.has(t)) && rest.length >= 2 && rest.every((t) => msgTokens.has(t));
    const brandOnly = rest.length === 0; // ex.: modelo "AirPods" sem número
    if (strict || loose || (brandOnly && strict)) matched.push(model);
  }
  // fica só o mais específico ("15 pro max" cobre "15 pro")
  const specific = matched.filter((m) => {
    const a = modelSets.get(m)!;
    return !matched.some((o) => o !== m && modelSets.get(o)!.size > a.size && [...a].every((t) => modelSets.get(o)!.has(t)));
  });

  const toLine = (d: StockDevice): StockLine => ({
    model: d.model,
    capacity: d.capacity,
    color: d.color,
    condition: d.condition,
    battery: d.batteryHealth,
    price: d.salePrice,
  });
  const byPrice = (a: StockLine, b: StockLine) =>
    (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER) || a.model.localeCompare(b.model);

  if (specific.length > 0) {
    let pool = devices.filter((d) => specific.includes(d.model));
    // capacidade citada (128, 256, 512, 1tb)
    const caps = new Set<string>();
    for (const m of msgNorm.matchAll(/\b(64|128|256|512|1024)\b|\b1 ?(tb|tera)\b/g)) caps.add(m[1] ?? "1024");
    if (caps.size > 0) {
      const f = pool.filter((d) => {
        const c = norm(d.capacity).replace(/[^0-9]/g, "");
        return caps.has(c) || (caps.has("1024") && /^1(tb)?$/.test(norm(d.capacity).replace(/ /g, "")));
      });
      if (f.length > 0) pool = f;
    }
    // condição citada
    const wantsNew = /\blacrad/.test(msgNorm);
    const wantsUsed = /\bseminov|\busad/.test(msgNorm);
    if (wantsNew !== wantsUsed) {
      const f = pool.filter((d) => (wantsNew ? /lacr/i : /semin/i).test(norm(d.condition)));
      if (f.length > 0) pool = f;
    }
    const lines = pool.map(toLine).sort(byPrice);
    return { items: lines.slice(0, limit), total: lines.length, modelHit: true, catalog: [] };
  }

  // não citou modelo: resumo do que existe (modelo + capacidade, a partir de quanto)
  const groups = new Map<string, { model: string; capacity: string; from: number | null; count: number }>();
  for (const d of devices) {
    const key = `${d.model}|${d.capacity}`;
    const g = groups.get(key) ?? { model: d.model, capacity: d.capacity, from: null, count: 0 };
    g.count += 1;
    if (d.salePrice !== null && (g.from === null || d.salePrice < g.from)) g.from = d.salePrice;
    groups.set(key, g);
  }
  const catalog = [...groups.values()].sort((a, b) => a.model.localeCompare(b.model)).slice(0, 15);
  return { items: [], total: 0, modelHit: false, catalog };
}

// Linha de texto para o prompt (preço só se existir: sem preço = "preço sob consulta")
export function stockLineText(l: StockLine): string {
  const parts = [`${l.model}${l.capacity ? " " + l.capacity + (/^\d+$/.test(l.capacity) ? "GB" : "") : ""}`, l.color, l.condition];
  if (l.battery !== null && /semin/i.test(norm(l.condition))) parts.push(`bateria ${l.battery}%`);
  parts.push(l.price !== null && l.price > 0 ? fmtBRL(l.price) : "preço sob consulta (não informar valor)");
  return parts.filter(Boolean).join(" | ");
}
