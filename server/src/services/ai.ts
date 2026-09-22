import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index";
import { aiDocuments, aiEvents, customers, devices, messageLogs, serviceOrders } from "../db/schema/index";
import { getCustomVar } from "./secrets";
import { getSetting } from "./settings";
import { phoneKey } from "../lib/crmText";
import { retrieve, type KbDocument } from "../lib/aiRetrieval";
import { allowedPriceSet, classifyKind, fmtBRL, extractOsReference, firstNameOf, redactPII, unknownPrices, type AiKind, type OsReference } from "../lib/aiPrivacy";
import { selectStock, stockLineText, type StockDevice } from "../lib/aiStock";
import { buildContents, buildRequestBody, buildSystemInstruction, type GeminiContent, type HistoryItem, type OsContext } from "../lib/aiPrompt";
import { parseGeminiResponse } from "../lib/aiParse";
import type { AiSettings } from "../lib/aiConfig";

// IA (Gemini) no atendimento — Fase 5B.
// A chave vem da variável customizada GEMINI_API_KEY (Configurações > Variáveis, cifrada) ou da variável de ambiente
// GEMINI_API_KEY. GEMINI_BASE_URL (opcional) troca o endereço da API (usado nos testes com um servidor falso).
// A API REAL do Gemini não foi exercitada neste projeto: o formato segue a documentação pública (generateContent).

export type AiErrorCode =
  | "not_configured"
  | "disabled"
  | "empty_message"
  | "blocked"
  | "invalid_json"
  | "truncated"
  | "empty"
  | "timeout"
  | "rate_limited"
  | "auth"
  | "bad_request"
  | "provider_error"
  | "network";

export const NOT_CONFIGURED_MESSAGE =
  "IA não configurada: cadastre a chave GEMINI_API_KEY em Configurações › Variáveis (ou na variável de ambiente do servidor).";
export const DISABLED_MESSAGE = "A IA está desligada. Ligue o interruptor em IA no Atendimento › Configuração.";

export class AiError extends Error {
  constructor(public code: AiErrorCode, message: string, public httpStatus = 502) {
    super(message);
  }
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const timeoutMs = () => num(process.env.GEMINI_TIMEOUT_MS, 20_000);
const retryDelayMs = () => num(process.env.GEMINI_RETRY_DELAY_MS, 800);
export const geminiBase = () => (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");

export interface GeminiKey {
  key: string;
  source: "variavel" | "ambiente";
}

// Variável customizada primeiro (o dono troca sem mexer no servidor); depois a variável de ambiente
export async function resolveGeminiKey(): Promise<GeminiKey | null> {
  const v = (await getCustomVar("GEMINI_API_KEY"))?.trim();
  if (v) return { key: v, source: "variavel" };
  const e = process.env.GEMINI_API_KEY?.trim();
  if (e) return { key: e, source: "ambiente" };
  return null;
}

export async function aiAvailability() {
  const [cfg, key] = await Promise.all([getSetting("ai"), resolveGeminiKey()]);
  return { enabled: cfg.enabled, configured: Boolean(key), keySource: key?.source ?? null, autoSend: cfg.autoSend, model: cfg.model, confidenceThreshold: cfg.confidenceThreshold };
}

// ---------------- chamada ao Gemini ----------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function upstreamMessage(json: unknown): string {
  const m = (json as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof m === "string" ? m.slice(0, 160) : "";
}

// POST {base}/v1beta/models/{model}:generateContent (cabeçalho x-goog-api-key). 1 nova tentativa em 429/5xx.
export async function callGemini(model: string, body: unknown, key: string): Promise<unknown> {
  const url = `${geminiBase()}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs()),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") throw new AiError("timeout", "O Gemini demorou demais para responder. Tente de novo.", 504);
      throw new AiError("network", "Não foi possível falar com o Gemini (rede).", 502);
    }
    lastStatus = res.status;
    const text = await res.text().catch(() => "");
    if (text.length > 2_000_000) throw new AiError("provider_error", "Resposta do Gemini grande demais.");
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (res.ok) {
      if (json === null) throw new AiError("invalid_json", "Resposta do Gemini em formato inesperado.");
      return json;
    }
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await sleep(retryDelayMs());
      continue;
    }
    const detail = upstreamMessage(json);
    if (res.status === 429) throw new AiError("rate_limited", "Limite de uso do Gemini atingido. Tente novamente em instantes.", 503);
    if (res.status >= 500) throw new AiError("provider_error", `O Gemini está com problemas (HTTP ${res.status}). Tente novamente.`, 502);
    if (res.status === 401 || res.status === 403 || /api key/i.test(detail)) {
      throw new AiError("auth", "O Gemini recusou a chave GEMINI_API_KEY (inválida, expirada ou sem permissão). Confira em Configurações › Variáveis.", 502);
    }
    if (res.status === 404) throw new AiError("bad_request", "Modelo do Gemini não encontrado: confira o nome do modelo na configuração da IA.", 502);
    throw new AiError("bad_request", `O Gemini recusou o pedido (HTTP ${res.status}).${detail ? " " + detail : ""}`, 502);
  }
  throw new AiError("provider_error", `O Gemini está com problemas (HTTP ${lastStatus}).`, 502);
}

// ---------------- contexto ----------------

export interface AiSource {
  docId: string;
  title: string;
}

export async function loadKnowledge(): Promise<KbDocument[]> {
  const rows = await db.select().from(aiDocuments).where(eq(aiDocuments.active, true));
  return rows.map((r) => ({ id: r.id, title: r.title, category: r.category, tags: r.tags ?? [], content: r.content, active: r.active }));
}

// Só o que é comercial: a consulta nem lê custo, fornecedor, IMEI/serial ou observações.
export async function loadAvailableStock(): Promise<StockDevice[]> {
  const rows = await db
    .select({
      model: devices.model,
      capacity: devices.capacity,
      color: devices.color,
      condition: devices.condition,
      batteryHealth: devices.batteryHealth,
      salePrice: devices.salePrice,
    })
    .from(devices)
    .where(eq(devices.status, "Disponível"));
  return rows.map((r) => ({
    model: r.model,
    capacity: r.capacity,
    color: r.color,
    condition: String(r.condition),
    batteryHealth: r.batteryHealth,
    salePrice: r.salePrice === null ? null : Number(r.salePrice),
  }));
}

// Status da OS SÓ para o telefone dono dela (o telefone da OS ou o WhatsApp do cliente cadastrado).
// Devolve apenas situação/datas e o primeiro nome: nada de CPF, valores, defeito ou observações.
export async function lookupOs(ref: OsReference, phone: string): Promise<OsContext> {
  if (ref.osCodes.length === 0 && ref.cpfs.length === 0) return { state: "no_reference" };
  const rows = await db
    .select({
      id: serviceOrders.id,
      status: serviceOrders.status,
      model: serviceOrders.model,
      color: serviceOrders.color,
      customerName: serviceOrders.customerName,
      customerPhone: serviceOrders.customerPhone,
      customerCpf: serviceOrders.customerCpf,
      custWhatsapp: customers.whatsapp,
      custCpf: customers.cpf,
      updatedAt: serviceOrders.updatedAt,
      completedAt: serviceOrders.completedAt,
    })
    .from(serviceOrders)
    .leftJoin(customers, eq(customers.id, serviceOrders.customerId))
    .where(
      ref.osCodes.length > 0
        ? sql`upper(left(${serviceOrders.id}::text, 8)) in (${sql.join(ref.osCodes.map((c) => sql`${c}`), sql`, `)})`
        : sql`regexp_replace(coalesce(${serviceOrders.customerCpf}, ${customers.cpf}, ''), '\\D', '', 'g') in (${sql.join(ref.cpfs.map((c) => sql`${c}`), sql`, `)})`
    )
    .orderBy(desc(serviceOrders.updatedAt))
    .limit(20);
  const mine = phoneKey(phone);
  const hit = rows.find((r) => {
    if (mine.length < 10) return false;
    return phoneKey(r.customerPhone) === mine || phoneKey(r.custWhatsapp) === mine;
  });
  if (!hit) return { state: "not_verified" };
  return {
    state: "found",
    code: hit.id.slice(0, 8).toUpperCase(),
    firstName: firstNameOf(hit.customerName) || "cliente",
    device: `${hit.model}${hit.color ? " " + hit.color : ""}`,
    status: String(hit.status),
    updatedAt: hit.updatedAt.toISOString(),
    completedAt: hit.completedAt ? hit.completedAt.toISOString() : null,
  };
}

export async function loadHistory(leadId: string | null | undefined, n: number): Promise<HistoryItem[]> {
  if (!leadId || n <= 0) return [];
  const rows = await db
    .select({ direction: messageLogs.direction, message: messageLogs.message, status: messageLogs.status })
    .from(messageLogs)
    .where(eq(messageLogs.recipientId, leadId))
    .orderBy(desc(messageLogs.sentAt))
    .limit(n);
  return rows
    .reverse()
    .filter((r) => (r.message ?? "").trim() && (r.direction === "in" || r.status === "sent"))
    .map((r) => ({ role: r.direction === "in" ? ("cliente" as const) : ("loja" as const), text: redactPII((r.message ?? "").slice(0, 500)) }));
}

const KIND_HINT: Record<AiKind, string> = { preco: "preço valor", troca: "troca avaliação", os: "", geral: "" };

// ---------------- geração ----------------

export interface GenerateInput {
  kind?: AiKind; // sem tipo: o servidor classifica pela pergunta
  message: string;
  sender: { phone: string; firstName?: string };
  history?: HistoryItem[];
}

export interface GenerateOutput {
  ok: boolean;
  kind: AiKind;
  reply: string;
  confidence: number;
  needsHuman: boolean;
  reason: string;
  sources: AiSource[];
  usedContext: { stock: number; os: boolean; knowledge: number };
  tokens: number | null;
  latencyMs: number;
  model: string;
  question: string; // texto (sem dados pessoais) que foi ao modelo
  error?: string;
  errorCode?: AiErrorCode;
  prompt: { system: string; contents: GeminiContent[] };
}

const FALLBACK_REPLY = "Vou confirmar essa informação com a nossa equipe e já te retorno, tudo bem?";

// Monta o contexto, chama o Gemini e devolve a resposta já checada. NÃO grava nada e NÃO envia nada:
// quem chama decide (registrar evento, mandar para revisão, enviar). Nunca lança: falhas voltam em `error`.
export async function generateReply(input: GenerateInput, opts: { ignoreEnabled?: boolean } = {}): Promise<GenerateOutput> {
  const started = Date.now();
  const cfg: AiSettings = await getSetting("ai");
  const message = (input.message ?? "").trim().slice(0, 2000);
  const kind: AiKind = input.kind ?? classifyKind(message);
  const question = redactPII(message);
  const base: GenerateOutput = {
    ok: false, kind, reply: "", confidence: 0, needsHuman: true, reason: "", sources: [],
    usedContext: { stock: 0, os: false, knowledge: 0 }, tokens: null, latencyMs: 0, model: cfg.model, question,
    prompt: { system: "", contents: [] },
  };
  const fail = (code: AiErrorCode, msg: string): GenerateOutput => ({ ...base, error: msg, errorCode: code, latencyMs: Date.now() - started });

  if (!message) return fail("empty_message", "Escreva a pergunta do cliente.");
  if (!cfg.enabled && !opts.ignoreEnabled) return fail("disabled", DISABLED_MESSAGE);
  const key = await resolveGeminiKey();
  if (!key) return fail("not_configured", NOT_CONFIGURED_MESSAGE);

  try {
    // ---- contexto ----
    const ref = extractOsReference(message); // lido do texto ORIGINAL (o modelo só vê o texto sem dados pessoais)
    const [docs, store] = await Promise.all([loadKnowledge(), getSetting("store")]);
    const hits = retrieve(`${question} ${KIND_HINT[kind]}`, docs, { k: 4 });
    const sources: AiSource[] = [];
    for (const h of hits) if (!sources.some((s) => s.docId === h.docId)) sources.push({ docId: h.docId, title: h.title });

    let stock: ReturnType<typeof selectStock> | null = null;
    if (kind === "preco" || kind === "geral" || kind === "troca") {
      const sel = selectStock(message, await loadAvailableStock(), 8);
      // "geral" e "troca" só levam estoque quando a pergunta cita um modelo; "preco" leva também o resumo do catálogo
      if (kind === "preco" || sel.modelHit) stock = sel;
    }

    let os: OsContext | null = null;
    if (kind === "os" || ref.osCodes.length > 0 || ref.cpfs.length > 0) os = await lookupOs(ref, input.sender.phone);

    const tradePolicy =
      kind === "troca" &&
      hits.some((h) => h.tags.some((t) => /troca|avaliacao/.test(t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())));

    const system = buildSystemInstruction({
      storeName: store.name,
      tone: cfg.tone,
      guardrails: cfg.guardrails,
      kind,
      knowledge: hits.map((h) => ({ title: h.title, category: h.category, text: h.text })),
      stock,
      os,
      tradePolicy,
      senderFirstName: firstNameOf(input.sender.firstName ?? ""),
    });
    // o último "cliente" do histórico costuma ser a própria pergunta: não repete
    const hist = [...(input.history ?? [])];
    const lastH = hist[hist.length - 1];
    if (lastH && lastH.role === "cliente" && lastH.text.trim() === question.trim()) hist.pop();
    const contents = buildContents(hist.slice(-Math.max(0, cfg.historyMessages)), question);
    const reqBody = buildRequestBody(system, contents, { model: cfg.model, temperature: cfg.temperature, maxOutputTokens: cfg.maxOutputTokens });
    const usedContext = { stock: stock?.items.length ?? 0, os: os?.state === "found", knowledge: hits.length };
    const withCtx: GenerateOutput = { ...base, sources, usedContext, prompt: { system, contents } };

    // ---- chamada ----
    const json = await callGemini(cfg.model, reqBody, key.key);
    const parsed = parseGeminiResponse(json);
    const latencyMs = Date.now() - started;
    if (!parsed.ok) {
      return { ...withCtx, tokens: parsed.tokens, latencyMs, error: parsed.message, errorCode: parsed.code };
    }
    let { reply, confidence, needsHuman } = parsed.value;
    let reason = parsed.value.reason;
    const flag = (msg: string, cap?: number) => {
      needsHuman = true;
      reason = (reason ? reason + " " : "") + msg;
      if (cap !== undefined) confidence = Math.min(confidence, cap);
    };

    // ---- verificações determinísticas (a IA nunca inventa preço) ----
    const strictSrc = [...(stock?.items.map(stockLineText) ?? []), ...(stock?.catalog.map((c) => `${c.from ? fmtBRL(c.from) : ""}`) ?? []), question];
    const allowed = allowedPriceSet(strictSrc, hits.map((h) => h.text));
    const bad = unknownPrices(reply, allowed);
    if (bad.length > 0) flag("A resposta cita valor que não está no estoque nem na base de conhecimento.", 0.4);
    if (kind === "troca" && !tradePolicy) flag("Avaliação de troca: um atendente precisa avaliar o aparelho.", 0.6);
    if (kind === "os" && os?.state !== "found") flag("Não foi possível confirmar a OS para este telefone.", 0.6);
    if (!reply.trim()) reply = FALLBACK_REPLY;

    return { ...withCtx, ok: true, reply, confidence, needsHuman, reason, tokens: parsed.tokens, latencyMs };
  } catch (err) {
    if (err instanceof AiError) return fail(err.code, err.message);
    console.error("IA: falha inesperada", (err as Error)?.message);
    return fail("provider_error", "Falha inesperada ao gerar a resposta da IA.");
  }
}

// ---------------- registro (métricas e auditoria) ----------------

export type AiEventStatus =
  | "sugerida" | "usada" | "enviada_humano" | "descartada" | "enviada_auto"
  | "em_revisao" | "aprovada" | "editada" | "simulada" | "erro" | "falha_envio";

export async function recordEvent(
  out: GenerateOutput,
  meta: { origin: "webhook" | "sugestao" | "playground"; phone: string; leadId?: string | null; status: AiEventStatus }
): Promise<string> {
  const [row] = await db
    .insert(aiEvents)
    .values({
      kind: out.kind,
      origin: meta.origin,
      phone: phoneKey(meta.phone) || meta.phone,
      leadId: meta.leadId ?? null,
      question: out.question,
      reply: out.reply,
      confidence: out.ok ? out.confidence : null,
      needsHuman: out.needsHuman,
      status: out.ok ? meta.status : "erro",
      error: out.error ?? null,
      latencyMs: out.latencyMs,
      tokens: out.tokens,
      model: out.model,
      sources: out.sources,
    })
    .returning({ id: aiEvents.id });
  return row.id;
}

export async function setEventStatus(id: string | null | undefined, status: AiEventStatus, error?: string | null) {
  if (!id) return;
  await db
    .update(aiEvents)
    .set({ status, ...(error !== undefined ? { error } : {}) })
    .where(eq(aiEvents.id, id));
}

// Respostas automáticas já enviadas (ou em envio) a este telefone na última hora
export async function autoSentLastHour(phone: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiEvents)
    .where(and(eq(aiEvents.phone, phoneKey(phone) || phone), eq(aiEvents.status, "enviada_auto"), sql`${aiEvents.createdAt} > now() - interval '1 hour'`));
  return Number(r?.n ?? 0);
}
