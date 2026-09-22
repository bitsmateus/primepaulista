import type { FastifyInstance, FastifyReply } from "fastify";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { aiDocuments, aiEvents, aiReviews, leads, messageLogs } from "../db/schema/index";
import { authenticate, requireCapability, type JwtUser } from "../plugins/auth";
import { logAudit, diffFields } from "../services/audit";
import { SETTINGS, getSetting, saveSetting } from "../services/settings";
import { DEFAULT_AI, DEFAULT_GUARDRAILS } from "../lib/aiConfig";
import { firstNameOf, type AiKind } from "../lib/aiPrivacy";
import { DOC_CATEGORIES, MAX_DOC_CHARS, estimateTokens } from "../lib/aiRetrieval";
import { decideDelivery } from "../lib/aiDecision";
import { phoneKey } from "../lib/crmText";
import {
  aiAvailability, autoSentLastHour, generateReply, loadHistory, recordEvent, setEventStatus,
  type AiErrorCode, type GenerateOutput,
} from "../services/ai";
import { approveReview, discardReview } from "../services/aiRules";
import { TZ, zonedParts } from "../lib/keywordRules";

// IA no atendimento (Fase 5B)
//  - useAI (admin, gerente, vendedor): sugerir resposta na conversa e revisar/aprovar as respostas da IA;
//  - manageAI (admin, gerente): configuração, base de conhecimento, simulador e métricas.
// A chave do Gemini nunca passa por aqui: vem da variável GEMINI_API_KEY (cifrada) ou do ambiente.

const uuid = z.string().uuid();
const kindEnum = z.enum(["preco", "troca", "os", "geral"]);

const HTTP_BY_CODE: Record<AiErrorCode, number> = {
  not_configured: 503, disabled: 409, empty_message: 400, blocked: 422, invalid_json: 502, truncated: 502, empty: 502,
  timeout: 504, rate_limited: 503, auth: 502, bad_request: 502, provider_error: 502, network: 502,
};

// Resposta pública de uma geração (o prompt só vai para quem gerencia a IA)
function publicResult(out: GenerateOutput, eventId: string | null, withPrompt: boolean) {
  return {
    eventId,
    kind: out.kind,
    reply: out.reply,
    confidence: out.confidence,
    needsHuman: out.needsHuman,
    reason: out.reason,
    sources: out.sources,
    usedContext: out.usedContext,
    tokens: out.tokens,
    latencyMs: out.latencyMs,
    model: out.model,
    ...(withPrompt ? { prompt: out.prompt, question: out.question } : {}),
  };
}

function failReply(reply: FastifyReply, out: GenerateOutput) {
  const code = out.errorCode ?? "provider_error";
  return reply.code(HTTP_BY_CODE[code]).send({ error: out.error ?? "A IA não conseguiu responder.", code });
}

const docBase = z.object({
  title: z.string().trim().min(1, "Informe o título do documento").max(120),
  category: z.enum(DOC_CATEGORIES).default("OUTRO"),
  content: z.string().max(MAX_DOC_CHARS, "O documento passa de 200 KB. Divida em partes menores."),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  active: z.boolean().default(true),
  fileName: z.string().trim().max(200).nullable().optional(),
});
const docPatch = docBase.partial().strict();
const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim()).filter(Boolean))];

export async function aiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  const use = requireCapability("useAI", "manageAI");
  const manage = requireCapability("manageAI");
  // Chamadas que custam dinheiro (Gemini) têm limite próprio por IP; AI_RATE_LIMIT_PER_MIN sobe o limite (usado nos testes)
  const perMin = Number(process.env.AI_RATE_LIMIT_PER_MIN) > 0 ? Number(process.env.AI_RATE_LIMIT_PER_MIN) : 30;
  const limited = (max: number) => ({ config: { rateLimit: { max: Math.max(max, perMin), timeWindow: "1 minute" } } });

  // ---------- status e configuração ----------

  // GET /ai/status — a UI mostra o estado (chave, interruptor) e o número de itens na fila
  app.get("/ai/status", { preHandler: use }, async () => {
    const [av, pending] = await Promise.all([
      aiAvailability(),
      db.select({ n: count() }).from(aiReviews).where(eq(aiReviews.status, "pendente")),
    ]);
    return { ...av, pendingReviews: Number(pending[0]?.n ?? 0) };
  });

  app.get("/ai/config", { preHandler: manage }, async () => {
    return { config: await getSetting("ai"), defaults: { ...DEFAULT_AI, guardrails: DEFAULT_GUARDRAILS }, status: await aiAvailability() };
  });

  app.put("/ai/config", { preHandler: manage }, async (req, reply) => {
    const parsed = SETTINGS.ai.schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || "Dados inválidos", details: parsed.error.flatten() });
    }
    const before = await getSetting("ai");
    const next = { ...parsed.data, guardrails: parsed.data.guardrails.map((g) => g.trim()).filter(Boolean) };
    await saveSetting("ai", next, (req.user as JwtUser).sub);
    const diff = diffFields(before as never, next as never, ["enabled", "autoSend", "model", "temperature", "maxOutputTokens", "confidenceThreshold", "maxAutoPerHour", "historyMessages", "tone"]);
    const guardrailsChanged = JSON.stringify(before.guardrails) !== JSON.stringify(next.guardrails);
    const parts: string[] = [];
    if (before.enabled !== next.enabled) parts.push(next.enabled ? "LIGOU a IA" : "DESLIGOU a IA");
    if (before.autoSend !== next.autoSend) parts.push(next.autoSend ? "LIGOU o envio automático" : "desligou o envio automático");
    await logAudit(req, {
      action: "ai.config",
      entity: "ai",
      entityId: "config",
      description: `Alterou a configuração da IA${parts.length ? " (" + parts.join("; ") + ")" : ""}`,
      details: { ...diff, ...(guardrailsChanged ? { guardrails: { de: before.guardrails.length, para: next.guardrails.length } } : {}) },
    });
    return { config: await getSetting("ai"), status: await aiAvailability() };
  });

  // ---------- base de conhecimento ----------

  app.get("/ai/documents", { preHandler: manage }, async () => {
    const rows = await db.select().from(aiDocuments).orderBy(desc(aiDocuments.updatedAt));
    return { documents: rows };
  });

  app.post("/ai/documents", { preHandler: manage }, async (req, reply) => {
    const p = docBase.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message || "Dados inválidos" });
    const [tot] = await db.select({ n: count() }).from(aiDocuments);
    if (Number(tot.n) >= 100) return reply.code(400).send({ error: "Limite de 100 documentos na base de conhecimento." });
    const d = p.data;
    const [row] = await db
      .insert(aiDocuments)
      .values({
        title: d.title, category: d.category, content: d.content, tags: cleanTags(d.tags), active: d.active,
        fileName: d.fileName ?? null, tokenEstimate: estimateTokens(d.content), createdBy: (req.user as JwtUser).sub,
      })
      .returning();
    await logAudit(req, {
      action: "ai_document.create", entity: "ai_document", entityId: row.id,
      description: `Criou o documento "${row.title}" na base de conhecimento da IA`,
      details: { categoria: row.category, tokens: row.tokenEstimate, ativo: row.active },
    });
    return reply.code(201).send({ document: row });
  });

  app.patch("/ai/documents/:id", { preHandler: manage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const p = docPatch.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message || "Dados inválidos" });
    if (Object.keys(p.data).length === 0) return reply.code(400).send({ error: "Nada para alterar" });
    const d = p.data;
    const [row] = await db
      .update(aiDocuments)
      .set({
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.category !== undefined ? { category: d.category } : {}),
        ...(d.content !== undefined ? { content: d.content, tokenEstimate: estimateTokens(d.content) } : {}),
        ...(d.tags !== undefined ? { tags: cleanTags(d.tags) } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
        ...(d.fileName !== undefined ? { fileName: d.fileName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(aiDocuments.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Documento não encontrado" });
    const onlyToggle = Object.keys(d).length === 1 && d.active !== undefined;
    await logAudit(req, {
      action: onlyToggle ? "ai_document.toggle" : "ai_document.update", entity: "ai_document", entityId: id,
      description: onlyToggle ? `${row.active ? "Ativou" : "Desativou"} o documento "${row.title}" da IA` : `Alterou o documento "${row.title}" da IA`,
      details: { campos: Object.keys(d) },
    });
    return { document: row };
  });

  app.delete("/ai/documents/:id", { preHandler: manage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const [row] = await db.delete(aiDocuments).where(eq(aiDocuments.id, id)).returning();
    if (!row) return reply.code(404).send({ error: "Documento não encontrado" });
    await logAudit(req, {
      action: "ai_document.delete", entity: "ai_document", entityId: id,
      description: `Excluiu o documento "${row.title}" da base de conhecimento da IA`,
    });
    return { ok: true };
  });

  // ---------- geração ----------

  // POST /ai/suggest { leadId, message?, kind? } — sugere uma resposta na conversa do lead (nada é enviado)
  app.post("/ai/suggest", { preHandler: use, ...limited(30) }, async (req, reply) => {
    const p = z
      .object({ leadId: uuid, message: z.string().trim().min(1).max(2000).optional(), kind: kindEnum.optional() })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message || "Dados inválidos" });
    const [lead] = await db.select().from(leads).where(eq(leads.id, p.data.leadId)).limit(1);
    if (!lead) return reply.code(404).send({ error: "Lead não encontrado" });
    if (phoneKey(lead.phone).length < 10) return reply.code(400).send({ error: "O lead não tem um telefone válido." });
    let message = p.data.message;
    if (!message) {
      const [last] = await db
        .select({ m: messageLogs.message })
        .from(messageLogs)
        .where(and(eq(messageLogs.recipientId, lead.id), eq(messageLogs.direction, "in")))
        .orderBy(desc(messageLogs.sentAt))
        .limit(1);
      message = last?.m ?? undefined;
    }
    if (!message?.trim()) return reply.code(400).send({ error: "Ainda não há mensagem do cliente nesta conversa. Escreva a pergunta do cliente." });
    const cfg = await getSetting("ai");
    const out = await generateReply({
      kind: p.data.kind as AiKind | undefined,
      message,
      sender: { phone: lead.phone ?? "", firstName: firstNameOf(lead.name) },
      history: await loadHistory(lead.id, cfg.historyMessages),
    });
    if (!out.ok) {
      if (out.errorCode !== "not_configured" && out.errorCode !== "disabled" && out.errorCode !== "empty_message") {
        await recordEvent(out, { origin: "sugestao", phone: lead.phone ?? "", leadId: lead.id, status: "erro" }).catch(() => undefined);
      }
      return failReply(reply, out);
    }
    const eventId = await recordEvent(out, { origin: "sugestao", phone: lead.phone ?? "", leadId: lead.id, status: "sugerida" });
    return { suggestion: { ...publicResult(out, eventId, false), lowConfidence: out.confidence < cfg.confidenceThreshold } };
  });

  // POST /ai/playground { message, kind?, phone? } — simulador do administrador: mostra também o prompt; não envia nada
  app.post("/ai/playground", { preHandler: manage, ...limited(30) }, async (req, reply) => {
    const p = z
      .object({ message: z.string().trim().min(1, "Digite a pergunta").max(2000), kind: kindEnum.optional(), phone: z.string().trim().max(30).optional() })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message || "Dados inválidos" });
    const phone = p.data.phone ?? "";
    const out = await generateReply(
      { kind: p.data.kind as AiKind | undefined, message: p.data.message, sender: { phone } },
      { ignoreEnabled: true } // o administrador testa antes de ligar o interruptor
    );
    if (!out.ok) {
      if (out.errorCode !== "not_configured" && out.errorCode !== "empty_message") {
        await recordEvent(out, { origin: "playground", phone: phone || "-", status: "erro" }).catch(() => undefined);
      }
      return failReply(reply, out);
    }
    const cfg = await getSetting("ai");
    const eventId = await recordEvent(out, { origin: "playground", phone: phone || "-", status: "simulada" });
    const decision = decideDelivery({
      config: cfg, confidence: out.confidence, needsHuman: out.needsHuman,
      autoSentLastHour: phoneKey(phone).length >= 10 ? await autoSentLastHour(phone) : 0,
    });
    return { result: { ...publicResult(out, eventId, true), decision, kindUsed: out.kind } };
  });

  // POST /ai/events/:id/outcome { outcome } — o que o atendente fez com a sugestão (métricas)
  app.post("/ai/events/:id/outcome", { preHandler: use }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const p = z.object({ outcome: z.enum(["usada", "enviada_humano", "descartada"]) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Resultado inválido" });
    const [ev] = await db.select().from(aiEvents).where(eq(aiEvents.id, id)).limit(1);
    if (!ev) return reply.code(404).send({ error: "Registro da IA não encontrado" });
    if (ev.origin !== "sugestao") return reply.code(409).send({ error: "Só sugestões da conversa aceitam este registro." });
    if (ev.status === "enviada_humano" || ev.status === "erro") return { ok: true, status: ev.status };
    await setEventStatus(id, p.data.outcome);
    return { ok: true, status: p.data.outcome };
  });

  // ---------- fila de revisão ----------

  // GET /ai/reviews?status=pendente|resolvidas|todas&limit=&offset=
  app.get("/ai/reviews", { preHandler: use }, async (req, reply) => {
    const q = z
      .object({
        status: z.enum(["pendente", "resolvidas", "todas"]).default("pendente"),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const where =
      q.data.status === "pendente" ? eq(aiReviews.status, "pendente")
      : q.data.status === "resolvidas" ? inArray(aiReviews.status, ["aprovado", "editado", "descartado"])
      : undefined;
    const rows = await db
      .select({
        id: aiReviews.id, eventId: aiReviews.eventId, phone: aiReviews.phone, leadId: aiReviews.leadId, leadName: leads.name,
        kind: aiReviews.kind, question: aiReviews.question, suggestedReply: aiReviews.suggestedReply, confidence: aiReviews.confidence,
        reason: aiReviews.reason, sources: aiReviews.sources, status: aiReviews.status, finalReply: aiReviews.finalReply,
        reviewedByName: aiReviews.reviewedByName, reviewedAt: aiReviews.reviewedAt, sent: aiReviews.sent, sendError: aiReviews.sendError,
        createdAt: aiReviews.createdAt,
      })
      .from(aiReviews)
      .leftJoin(leads, eq(leads.id, aiReviews.leadId))
      .where(where)
      .orderBy(q.data.status === "pendente" ? aiReviews.createdAt : desc(aiReviews.createdAt))
      .limit(q.data.limit)
      .offset(q.data.offset);
    const [pend] = await db.select({ n: count() }).from(aiReviews).where(eq(aiReviews.status, "pendente"));
    return { reviews: rows, pending: Number(pend.n) };
  });

  app.post("/ai/reviews/:id/approve", { preHandler: use, ...limited(30) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const p = z.object({ text: z.string().trim().min(1, "A resposta não pode ficar vazia").max(1500, "Resposta longa demais (máximo 1.500 caracteres)").optional() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message || "Dados inválidos" });
    const me = req.user as JwtUser;
    const r = await approveReview(id, p.data.text, { id: me.sub, name: me.name });
    if (!r.ok) return reply.code(r.code).send({ error: r.error });
    await logAudit(req, {
      action: "ai_review.approve", entity: "ai_review", entityId: id,
      description: `${r.status === "editado" ? "Editou e enviou" : "Aprovou e enviou"} uma resposta da IA`,
      details: { editada: r.status === "editado" },
    });
    return { ok: true, status: r.status };
  });

  app.post("/ai/reviews/:id/discard", { preHandler: use }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const me = req.user as JwtUser;
    const r = await discardReview(id, { id: me.sub, name: me.name });
    if (!r.ok) return reply.code(r.code).send({ error: r.error });
    await logAudit(req, { action: "ai_review.discard", entity: "ai_review", entityId: id, description: "Descartou uma resposta da IA" });
    return { ok: true };
  });

  // ---------- métricas ----------

  // GET /ai/metrics?days=30 — "IA no atendimento" (o simulador não conta)
  app.get("/ai/metrics", { preHandler: manage }, async (req, reply) => {
    const q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const days = q.data.days;
    const since = sql`now() - (${days} * interval '1 day')`;
    const tot = await db.execute(sql`
      select count(*)::int as total,
        count(*) filter (where status = 'enviada_auto')::int as auto,
        count(*) filter (where status in ('aprovada','editada'))::int as reviewed,
        count(*) filter (where status in ('enviada_humano','usada'))::int as agent,
        count(*) filter (where status = 'descartada')::int as discarded,
        count(*) filter (where status = 'em_revisao')::int as in_review,
        count(*) filter (where status in ('erro','falha_envio'))::int as errors,
        avg(confidence) filter (where confidence is not null) as avg_conf,
        avg(latency_ms) filter (where latency_ms is not null) as avg_latency,
        coalesce(sum(tokens), 0)::int as tokens
      from ai_events where origin <> 'playground' and created_at >= ${since}`);
    const t = tot.rows[0] as Record<string, string | number | null>;
    const total = Number(t.total);
    const rate = (n: number) => (total ? n / total : 0);
    const perDay = await db.execute(sql`
      select to_char((created_at AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') as d,
        count(*)::int as total,
        count(*) filter (where status = 'enviada_auto')::int as auto,
        count(*) filter (where status in ('aprovada','editada','enviada_humano','usada'))::int as reviewed,
        count(*) filter (where status = 'descartada')::int as discarded,
        count(*) filter (where status in ('erro','falha_envio'))::int as errors
      from ai_events where origin <> 'playground' and created_at >= ${since} group by 1`);
    const map = new Map((perDay.rows as { d: string; total: number; auto: number; reviewed: number; discarded: number; errors: number }[]).map((r) => [r.d, r]));
    const daily = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = zonedParts(new Date(Date.now() - i * 86_400_000)).date;
      const r = map.get(date);
      daily.push({ date, total: r ? Number(r.total) : 0, auto: r ? Number(r.auto) : 0, reviewed: r ? Number(r.reviewed) : 0, discarded: r ? Number(r.discarded) : 0, errors: r ? Number(r.errors) : 0 });
    }
    const perKind = await db.execute(sql`
      select kind, count(*)::int as total from ai_events where origin <> 'playground' and created_at >= ${since} group by kind order by total desc`);
    const [pend] = await db.select({ n: count() }).from(aiReviews).where(eq(aiReviews.status, "pendente"));
    return {
      days,
      totals: {
        questions: total,
        auto: Number(t.auto), reviewed: Number(t.reviewed), agent: Number(t.agent), discarded: Number(t.discarded),
        inReview: Number(t.in_review), errors: Number(t.errors), pendingReviews: Number(pend.n), tokens: Number(t.tokens),
      },
      rates: {
        auto: rate(Number(t.auto)), reviewed: rate(Number(t.reviewed)), discarded: rate(Number(t.discarded)), errors: rate(Number(t.errors)),
      },
      avgConfidence: t.avg_conf === null ? null : Number(t.avg_conf),
      avgLatencyMs: t.avg_latency === null ? null : Math.round(Number(t.avg_latency)),
      daily,
      byKind: (perKind.rows as { kind: AiKind; total: number }[]).map((r) => ({ kind: r.kind, total: Number(r.total) })),
    };
  });

}
