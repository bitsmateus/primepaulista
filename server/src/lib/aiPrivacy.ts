// Privacidade (LGPD) e verificações determinísticas da IA. Arquivo puro (sem imports).
// O texto do cliente é enviado ao Google (Gemini): só sai o necessário, SEM CPF, CNPJ, e-mail, telefone,
// CEP, endereço ou número de cartão. O CPF/número da OS informados na pergunta são lidos AQUI (no servidor),
// antes da remoção, apenas para consultar a OS; o modelo nunca vê o CPF.

export type AiKind = "preco" | "troca" | "os" | "geral";
export const AI_KINDS: AiKind[] = ["preco", "troca", "os", "geral"];
export const AI_KIND_LABELS: Record<AiKind, string> = {
  preco: "Cotação & Preços",
  troca: "Avaliação de Troca",
  os: "Consulta de Status de OS",
  geral: "Atendimento geral",
};

const RULES: { re: RegExp; label: string }[] = [
  { re: /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi, label: "[e-mail removido]" },
  { re: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, label: "[CNPJ removido]" },
  { re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, label: "[CPF removido]" },
  { re: /\b(?:\d[ -]?){13,19}\b/g, label: "[número removido]" },
  // celular (com ou sem DDD/DDI), fixo com DDD entre parênteses e fixo com hífen
  { re: /(?:\+?55[\s-]?)?(?:\(\d{2}\)\s?|\b\d{2}[\s-]?)9\d{4}[-\s]?\d{4}\b/g, label: "[telefone removido]" },
  { re: /(?:\+?55[\s-]?)?\(\d{2}\)\s?\d{4}[-\s]?\d{4}\b/g, label: "[telefone removido]" },
  { re: /\b\d{4}-\d{4}\b/g, label: "[telefone removido]" },
  { re: /\bcep\s*:?\s*\d{5}-?\d{3}\b/gi, label: "[CEP removido]" },
  { re: /\b\d{5}-\d{3}\b/g, label: "[CEP removido]" },
  // endereço: tipo de logradouro + nome + número
  {
    re: /\b(?:rua|avenida|av\.?|alameda|travessa|estrada|rodovia|pra[cç]a|r\.)\s+[^,\n\d]{2,50}[,\s]+(?:n[º°o.]*\s*)?\d{1,5}\b/gi,
    label: "[endereço removido]",
  },
];

// Remove dados pessoais do texto que vai ao modelo (e que fica no registro da IA)
export function redactPII(text: string): string {
  let out = text ?? "";
  for (const r of RULES) out = out.replace(r.re, r.label);
  return out;
}

// Primeiro nome do cliente (nunca o telefone que o WhatsApp usa como nome)
export function firstNameOf(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n || /\d{4,}/.test(n)) return "";
  const first = n.split(/\s+/)[0].replace(/[^\p{L}'-]/gu, "");
  return first.length >= 2 && first.length <= 30 ? first : "";
}

export interface OsReference {
  osCodes: string[]; // "A1B2C3D4" (8 primeiros caracteres do id da OS, maiúsculos)
  cpfs: string[]; // só dígitos
}

// Lê da pergunta (texto ORIGINAL) o número da OS e/ou o CPF, só para consultar a OS
export function extractOsReference(text: string): OsReference {
  const raw = text ?? "";
  const osCodes = new Set<string>();
  const re = /\b(?:os|o\.s\.?|ordem\s+de\s+servi[cç]o)\s*(?:n[º°o.]*)?\s*[:#-]?\s*([0-9a-f]{8})\b/gi;
  for (const m of raw.matchAll(re)) osCodes.add(m[1].toUpperCase());
  const cpfs = new Set<string>();
  for (const m of raw.matchAll(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g)) cpfs.add(m[0].replace(/\D/g, ""));
  return { osCodes: [...osCodes].slice(0, 3), cpfs: [...cpfs].slice(0, 2) };
}

const norm = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Escolhe o tipo de atendimento quando quem chama não informa
export function classifyKind(message: string): AiKind {
  const ref = extractOsReference(message);
  const t = ` ${norm(message)} `;
  if (ref.osCodes.length > 0 || /\b(minha os|ordem de servico|status do (conserto|reparo)|meu (aparelho|celular|iphone) (ja )?(esta|ta) pronto|assistencia tecnica)\b/.test(t)) return "os";
  if (/\b(troca|trocar|trade|na troca|avaliacao|avaliar|dar o meu|dar meu)\b/.test(t)) return "troca";
  if (/\b(preco|valor|quanto|custa|custando|parcela|parcelar|parcelado|orcamento|a vista|desconto|tabela)\b/.test(t)) return "preco";
  return "geral";
}

// ---- Verificação de preços na resposta ("a IA nunca inventa preço") ----

// Valores em reais citados no texto (R$ 5.990,00 | R$5990 | 5990 reais)
export function extractPrices(text: string): number[] {
  const out: number[] = [];
  const push = (s: string) => {
    const n = parseBRL(s);
    if (n !== null) out.push(n);
  };
  for (const m of (text ?? "").matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/gi)) push(m[1]);
  for (const m of (text ?? "").matchAll(/\b([\d.]+(?:,\d{1,2})?)\s*reais\b/gi)) push(m[1]);
  return out;
}

export function parseBRL(s: string): number | null {
  let t = s.trim();
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Valores que a resposta PODE citar: os do estoque (só "R$ ...") e os da base de conhecimento (também números
// soltos de tabelas, ex.: "iPhone 13 ....... 3.300"). O que o cliente escreveu também vale (ele pode repetir o próprio valor).
export function allowedPriceSet(strict: string[], loose: string[] = []): Set<number> {
  const set = new Set<number>();
  for (const s of [...strict, ...loose]) for (const p of extractPrices(s)) set.add(Math.round(p * 100));
  for (const s of loose) {
    for (const m of (s ?? "").matchAll(/\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b|\b\d{3,6}(?:,\d{2})?\b/g)) {
      const n = parseBRL(m[0]);
      if (n !== null) set.add(Math.round(n * 100));
    }
  }
  return set;
}

// Preços citados na resposta que NÃO aparecem no contexto permitido
export function unknownPrices(reply: string, allowed: Set<number>): number[] {
  return extractPrices(reply).filter((p) => !allowed.has(Math.round(p * 100)));
}

export function fmtBRL(v: number): string {
  const [i, d] = v.toFixed(2).split(".");
  return `R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
}
