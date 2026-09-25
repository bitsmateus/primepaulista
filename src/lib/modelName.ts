import { DeviceCategory } from "@/types/inventory";
import { MODELS_BY_CATEGORY } from "@/data/appleCatalog";

// Nomes de modelo digitados de formas diferentes ("14", "16 PM", "iphone 16 pro max")
// viram um nome único, para a lista, os relatórios e os totais agruparem o mesmo aparelho
// junto. Só a exibição/agrupamento usa isso; o nome gravado no aparelho não muda sozinho
// (há uma ação "Padronizar nomes" para quem quiser corrigir os cadastros).

// Chave de comparação: minúsculas, sem acento e só letras/números.
export function modelKey(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();

const catalogIndex = new Map<string, Map<string, string>>();
function indexFor(category: string): Map<string, string> {
  let idx = catalogIndex.get(category);
  if (!idx) {
    idx = new Map();
    for (const name of MODELS_BY_CATEGORY[category as DeviceCategory] ?? []) idx.set(modelKey(name), name);
    catalogIndex.set(category, idx);
  }
  return idx;
}

// Expande abreviações comuns de iPhone: "16 PM" -> "iPhone 16 Pro Max"
function expandIphone(raw: string): string {
  let s = clean(raw).replace(/^apple\s+/i, "");
  if (!s) return s;
  // "iphone" em qualquer caixa/colado ("iphone16")
  s = s.replace(/^i\s*phone\s*/i, "iPhone ");
  if (/^(\d|se\b|xr\b|xs\b|x\b)/i.test(s)) s = `iPhone ${s}`;
  s = s
    .replace(/\bpro[\s-]*max\b/gi, "Pro Max")
    .replace(/\bp\.?\s?m\.?\b/gi, "Pro Max")
    .replace(/\bpromax\b/gi, "Pro Max");
  // "SE 2" / "SE 3" / "SE (3ª geração)"
  s = s.replace(/\bSE\s*\(?\s*([23])\s*(?:ª|a|º)?\s*(?:gera[cç][aã]o)?\s*\)?/i, (_m, n) => `SE (${n}ª geração)`);
  return clean(s);
}

// Nome canônico do modelo. Casa com o catálogo quando possível; senão devolve o texto
// limpo (espaços duplicados removidos e "iPhone" com a caixa certa).
export function canonicalModel(category: string | undefined, model: string): string {
  const cat = category || "iPhone";
  const idx = indexFor(cat);
  const base = clean(model);
  if (!base) return "";

  const direct = idx.get(modelKey(base));
  if (direct) return direct;

  if (cat === "iPhone") {
    const expanded = expandIphone(base);
    const hit = idx.get(modelKey(expanded));
    if (hit) return hit;
    return expanded;
  }
  return base;
}

// Chave de agrupamento (mesmo modelo = mesma chave), ignorando caixa, acento e espaços.
export function modelGroupKey(category: string | undefined, model: string): string {
  return `${category || "iPhone"}|${modelKey(canonicalModel(category, model))}`;
}

export interface ModelRename {
  category: string;
  from: string;
  to: string;
  count: number;
}

// Renomeações sugeridas para padronizar cadastros já existentes: só onde o nome
// canônico é diferente do gravado, agrupadas por (nome atual → nome novo).
export function suggestModelRenames(devices: { category?: string; model: string }[]): ModelRename[] {
  const map = new Map<string, ModelRename>();
  for (const d of devices) {
    const to = canonicalModel(d.category, d.model);
    if (!to || to === d.model) continue;
    const key = `${d.category || "iPhone"}|${d.model}|${to}`;
    const cur = map.get(key);
    if (cur) cur.count++;
    else map.set(key, { category: d.category || "iPhone", from: d.model, to, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.to.localeCompare(b.to, "pt-BR") || a.from.localeCompare(b.from, "pt-BR"));
}
