// Leitura robusta da resposta do Gemini (generateContent). Arquivo puro (sem imports).
// Formato esperado (responseMimeType application/json + responseSchema): { reply, confidence, needs_human, reason? }.

export interface ParsedReply {
  reply: string;
  confidence: number; // 0..1
  needsHuman: boolean;
  reason: string;
}

export type ParseErrorCode = "blocked" | "empty" | "invalid_json" | "truncated";

export type ParseResult =
  | { ok: true; value: ParsedReply; tokens: number | null; finishReason: string | null }
  | { ok: false; code: ParseErrorCode; message: string; tokens: number | null };

export const MAX_REPLY_CHARS = 1500; // resposta de WhatsApp: mais que isso é sinal de problema

const BLOCK_REASONS = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "OTHER"]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Extrai um objeto JSON de um texto (aceita ```json ... ``` e texto ao redor)
export function extractJson(text: string): unknown | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    /* segue */
  }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* segue */
    }
  }
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {
      /* falhou */
    }
  }
  return null;
}

function tokensOf(json: unknown): number | null {
  if (!isObj(json) || !isObj(json.usageMetadata)) return null;
  const u = json.usageMetadata;
  const total = Number(u.totalTokenCount);
  if (Number.isFinite(total) && total > 0) return total;
  const sum = Number(u.promptTokenCount ?? 0) + Number(u.candidatesTokenCount ?? 0);
  return Number.isFinite(sum) && sum > 0 ? sum : null;
}

function toConfidence(v: unknown): number {
  let n = typeof v === "string" ? Number(v.replace(",", ".").replace("%", "")) : Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n > 1 && n <= 100) n = n / 100;
  return Math.min(1, Math.max(0, n));
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /^(true|sim|yes|1)$/i.test(v.trim());
  return Boolean(v);
}

// Interpreta o corpo devolvido pelo Gemini. Nunca lança.
export function parseGeminiResponse(json: unknown): ParseResult {
  const tokens = tokensOf(json);
  if (!isObj(json)) return { ok: false, code: "invalid_json", message: "Resposta do Gemini em formato inesperado.", tokens };

  // Bloqueio do PROMPT (antes de gerar)
  const fb = isObj(json.promptFeedback) ? json.promptFeedback : null;
  if (fb && typeof fb.blockReason === "string" && fb.blockReason) {
    return { ok: false, code: "blocked", message: `O Gemini bloqueou a pergunta por segurança (${fb.blockReason}).`, tokens };
  }

  const cands = Array.isArray(json.candidates) ? json.candidates : [];
  const cand = cands.find(isObj);
  if (!cand) return { ok: false, code: "empty", message: "O Gemini não devolveu nenhuma resposta.", tokens };

  const finish = typeof cand.finishReason === "string" ? cand.finishReason : null;
  if (finish && BLOCK_REASONS.has(finish)) {
    return { ok: false, code: "blocked", message: `O Gemini bloqueou a resposta por segurança (${finish}).`, tokens };
  }

  const content = isObj(cand.content) ? cand.content : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .filter((p) => isObj(p) && typeof p.text === "string" && p.thought !== true)
    .map((p) => (p as { text: string }).text)
    .join("");
  if (!text.trim()) {
    return finish === "MAX_TOKENS"
      ? { ok: false, code: "truncated", message: "A resposta do Gemini foi cortada (aumente o limite de tokens da resposta).", tokens }
      : { ok: false, code: "empty", message: "O Gemini devolveu uma resposta vazia.", tokens };
  }

  const obj = extractJson(text);
  if (!isObj(obj)) {
    return finish === "MAX_TOKENS"
      ? { ok: false, code: "truncated", message: "A resposta do Gemini foi cortada (aumente o limite de tokens da resposta).", tokens }
      : { ok: false, code: "invalid_json", message: "O Gemini devolveu uma resposta que não é um JSON válido.", tokens };
  }

  let reply = typeof obj.reply === "string" ? obj.reply.trim() : "";
  const reasonRaw = typeof obj.reason === "string" ? obj.reason.trim().slice(0, 300) : "";
  let needsHuman = toBool(obj.needs_human ?? obj.needsHuman);
  let reason = reasonRaw;
  if (!reply) {
    // sem texto de resposta: só faz sentido se pediu um humano
    if (!needsHuman) return { ok: false, code: "invalid_json", message: "O Gemini não devolveu o texto da resposta.", tokens };
    reply = "";
  }
  if (reply.length > MAX_REPLY_CHARS) {
    reply = reply.slice(0, MAX_REPLY_CHARS).replace(/\s+\S*$/, "") + "…";
    needsHuman = true;
    reason = (reason ? reason + " " : "") + "Resposta muito longa: revise antes de enviar.";
  }
  const confidence = toConfidence(obj.confidence ?? obj.confianca);
  return { ok: true, value: { reply, confidence, needsHuman, reason }, tokens, finishReason: finish };
}
