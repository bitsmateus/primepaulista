// Recuperação de trechos da base de conhecimento (RAG simples, SEM embeddings): BM25 em TypeScript puro.
// ATENÇÃO: este arquivo é ESPELHADO em src/lib/aiRetrieval.ts (o site usa a mesma regra em "Testar busca"
// e na contagem de tokens). Mantenha os dois idênticos; src/test/aiRetrieval.test.ts compara o texto dos arquivos
// e roda os mesmos casos nas duas cópias. Arquivo puro (sem imports) de propósito.

export const DOC_CATEGORIES = ["MANUAL", "TABELA_PRECOS", "POLITICA_GARANTIA", "POLITICA_PAGAMENTO", "OUTRO"] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

export const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  MANUAL: "Manual",
  TABELA_PRECOS: "Tabela de preços",
  POLITICA_GARANTIA: "Política de garantia",
  POLITICA_PAGAMENTO: "Política de pagamento",
  OUTRO: "Outro",
};

export const MAX_DOC_CHARS = 200_000; // ~200 KB por documento

export interface KbDocument {
  id: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
  active: boolean;
}

export interface KbHit {
  docId: string;
  title: string;
  category: string;
  tags: string[];
  chunkIndex: number;
  text: string;
  score: number;
}

// Estimativa de tokens (aproximação: ~4 caracteres por token; o número exato vem do modelo)
export function estimateTokens(text: string): number {
  return Math.ceil((text ?? "").length / 4);
}

// Texto sem acento, minúsculo, só letras e números separados por um espaço
export function normalizeText(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  (
    "a o as os um uma uns umas de da do das dos em no na nos nas por para pra pro com sem sobre entre e ou mas que se " +
    "eu voce vc tu ele ela nos vos eles elas me te lhe meu minha seu sua seus suas este esta isso isto esse essa aquele " +
    "aquela voces ao aos ha tem ter tenho tinha sao ser foi vai vou ja mais muito muita bom boa dia tarde noite ola oi pode " +
    "podem queria quero gostaria gostaria favor obrigado obrigada"
  ).split(" ")
);

// Radical leve para o português: plural e algumas terminações (não é um stemmer completo)
export function stem(token: string): string {
  let t = token;
  if (t.length > 4 && t.endsWith("oes")) t = t.slice(0, -3) + "ao";
  else if (t.length > 4 && t.endsWith("ais")) t = t.slice(0, -3) + "al";
  else if (t.length > 5 && t.endsWith("res")) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  return t;
}

// Sinônimos simples (já normalizados). Uma consulta com qualquer termo do grupo também procura os outros.
const SYNONYM_GROUPS: string[][] = [
  ["garantia", "cobertura", "defeito", "cobre", "cobrir", "assegurar"],
  ["preco", "valor", "custa", "quanto", "custo", "precinho"],
  ["parcelar", "parcela", "parcelamento", "cartao", "credito", "vezes", "juros"],
  ["pagamento", "pagar", "pix", "boleto", "dinheiro", "debito"],
  ["troca", "trocar", "permuta", "entrada", "avaliacao", "avaliar", "trade"],
  ["endereco", "localizacao", "onde", "fica", "chegar", "mapa"],
  ["horario", "funcionamento", "abre", "abrem", "fecha", "fecham", "aberto", "expediente", "hora"],
  ["bateria", "saude", "ciclo"],
  ["conserto", "reparo", "assistencia", "manutencao", "consertar", "reparar"],
  ["desconto", "abatimento", "promocao", "oferta", "negociar", "barato"],
  ["seminovo", "usado", "revisado"],
  ["lacrado", "novo", "caixa"],
];
const SYN_INDEX: Map<string, number> = (() => {
  const m = new Map<string, number>();
  SYNONYM_GROUPS.forEach((g, i) => g.forEach((w) => m.set(stem(w), i)));
  return m;
})();

function terms(text: string): string[] {
  const out: string[] = [];
  for (const raw of normalizeText(text).split(" ")) {
    if (!raw || STOPWORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

// Termos da consulta com os sinônimos (sem repetir)
export function queryTerms(query: string): string[] {
  const base = terms(query);
  const set = new Set<string>(base);
  for (const t of base) {
    const g = SYN_INDEX.get(t);
    if (g !== undefined) for (const w of SYNONYM_GROUPS[g]) set.add(stem(w));
  }
  return [...set];
}

// Quebra o texto em trechos de ~`size` caracteres, com sobreposição, respeitando parágrafos e palavras
export function chunkText(text: string, size = 800, overlap = 120): string[] {
  const clean = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  // 1) pedaços "atômicos" (parágrafos; parágrafo grande é fatiado em palavras)
  const atoms: { t: string; cont: boolean }[] = []; // cont = continuação do mesmo parágrafo (junta com espaço)
  for (const para of clean.split(/\n{2,}|\n(?=#{1,6}\s)/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= size) {
      atoms.push({ t: p, cont: false });
      continue;
    }
    let cur = "";
    let first = true;
    for (const w of p.split(/\s+/)) {
      if ((cur + " " + w).trim().length > size && cur) {
        atoms.push({ t: cur.trim(), cont: !first });
        first = false;
        cur = w;
      } else cur = (cur + " " + w).trim();
    }
    if (cur) atoms.push({ t: cur.trim(), cont: !first });
  }
  // 2) junta os atômicos até o tamanho, carregando o final do trecho anterior como sobreposição
  const chunks: string[] = [];
  let cur = "";
  for (const a of atoms) {
    const sep = a.cont ? " " : "\n\n";
    if (cur && (cur + sep + a.t).length > size) {
      chunks.push(cur);
      const tail = cur.length > overlap ? cur.slice(cur.length - overlap) : cur;
      const cut = tail.indexOf(" ");
      const carry = cut >= 0 && cut < tail.length - 1 ? tail.slice(cut + 1) : "";
      cur = carry ? carry + sep + a.t : a.t;
    } else cur = cur ? cur + sep + a.t : a.t;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

interface IndexedChunk {
  doc: KbDocument;
  chunkIndex: number;
  text: string;
  tf: Map<string, number>;
  len: number;
}

const K1 = 1.5;
const B = 0.75;
const TITLE_REPEAT = 3; // o título pesa como se aparecesse 3 vezes
const TAG_REPEAT = 4; // e as etiquetas 4 vezes

// Ranqueia os trechos dos documentos ATIVOS pela consulta (BM25 + reforço por título e etiquetas)
export function retrieve(query: string, docs: KbDocument[], opts: { k?: number; size?: number; overlap?: number } = {}): KbHit[] {
  const k = opts.k ?? 4;
  const q = queryTerms(query);
  if (q.length === 0) return [];
  const chunks: IndexedChunk[] = [];
  for (const doc of docs) {
    if (!doc.active) continue;
    const boost: string[] = [];
    const t = terms(doc.title);
    const g = doc.tags.flatMap((tag) => terms(tag));
    for (let i = 0; i < TITLE_REPEAT; i++) boost.push(...t);
    for (let i = 0; i < TAG_REPEAT; i++) boost.push(...g);
    chunkText(doc.content, opts.size ?? 800, opts.overlap ?? 120).forEach((text, chunkIndex) => {
      const toks = [...boost, ...terms(text)];
      const tf = new Map<string, number>();
      for (const tok of toks) tf.set(tok, (tf.get(tok) ?? 0) + 1);
      chunks.push({ doc, chunkIndex, text, tf, len: toks.length });
    });
    // documento sem conteúdo ainda pode ser achado pelo título/etiquetas
    if (!doc.content.trim() && boost.length) {
      const tf = new Map<string, number>();
      for (const tok of boost) tf.set(tok, (tf.get(tok) ?? 0) + 1);
      chunks.push({ doc, chunkIndex: 0, text: "", tf, len: boost.length });
    }
  }
  if (chunks.length === 0) return [];
  const N = chunks.length;
  const avg = chunks.reduce((s, c) => s + c.len, 0) / N || 1;
  const df = new Map<string, number>();
  for (const term of q) df.set(term, chunks.filter((c) => c.tf.has(term)).length);
  const scored: KbHit[] = [];
  for (const c of chunks) {
    let score = 0;
    for (const term of q) {
      const f = c.tf.get(term) ?? 0;
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (c.len / avg))));
    }
    if (score > 0) {
      scored.push({
        docId: c.doc.id,
        title: c.doc.title,
        category: c.doc.category,
        tags: c.doc.tags,
        chunkIndex: c.chunkIndex,
        text: c.text,
        score: Math.round(score * 10000) / 10000,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title) || a.chunkIndex - b.chunkIndex);
  return scored.slice(0, k);
}
