import { and, eq } from "drizzle-orm";
import { db } from "../db/index";
import { aiReviews, messageLogs } from "../db/schema/index";
import { callUazapi, getDefaultInstance, getInstance } from "./whatsapp";
import { normalizePhone } from "./osNotifications";
import { getSetting } from "./settings";
import { registerAiReplyGenerator, type AiReplyContext, type AiReplyOutcome } from "./keywordReplies";
import { autoSentLastHour, generateReply, loadHistory, recordEvent, setEventStatus, type GenerateOutput } from "./ai";
import { decideDelivery } from "../lib/aiDecision";
import { firstNameOf, type AiKind } from "../lib/aiPrivacy";

// Liga a IA às regras de resposta automática (action = "ai") sem mexer no webhook:
//  - o gerador registrado em registerAiReplyGenerator recebe a regra + a mensagem;
//  - decide "enviar sozinho" x "revisar" (lib/aiDecision) e devolve o resultado para o webhook.

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

export interface NewReview {
  eventId: string | null;
  phone: string;
  leadId: string | null;
  instanceId: string | null;
  kind: AiKind;
  question: string;
  suggestedReply: string;
  confidence: number | null;
  reason: string;
  sources: unknown[];
}

export async function createReview(r: NewReview): Promise<string> {
  const [row] = await db
    .insert(aiReviews)
    .values({
      eventId: r.eventId,
      phone: r.phone,
      leadId: r.leadId,
      instanceId: r.instanceId,
      kind: r.kind,
      question: r.question.slice(0, 2000),
      suggestedReply: r.suggestedReply,
      confidence: r.confidence,
      reason: r.reason.slice(0, 400),
      sources: r.sources,
    })
    .returning({ id: aiReviews.id });
  return row.id;
}

// Envia um texto pelo número indicado (ou o padrão), conferindo se está conectado. Devolve o erro (ou null).
export async function sendTextChecked(instanceId: string | null, phone: string, text: string): Promise<string | null> {
  const inst = instanceId ? await getInstance(instanceId) : await getDefaultInstance();
  if (!inst || !inst.instanceUrl || !inst.apiKey) return "Número de WhatsApp não configurado.";
  if (!inst.active) return "Número de WhatsApp inativo.";
  try {
    const st = await callUazapi(inst, "/instance/status", "GET");
    const state = String(st.data?.state || st.data?.status || "").toLowerCase();
    if (!(st.ok && (state === "open" || state === "connected"))) return "WhatsApp desconectado (leia o QR Code na aba WhatsApp).";
    const r = await callUazapi(inst, "/message/text", "POST", { number: normalizePhone(phone), text });
    return r.ok ? null : `O provedor recusou o envio (HTTP ${r.status}).`;
  } catch (err) {
    return `Falha de comunicação com o provedor: ${errText(err)}`.slice(0, 300);
  }
}

// Gerador usado pelas regras com ação "IA"
export async function aiRuleGenerator(ctx: AiReplyContext): Promise<AiReplyOutcome> {
  const cfg = await getSetting("ai");
  const kind: AiKind = ctx.rule.aiKind ?? "geral";
  const leadId = ctx.lead?.id ?? null;
  const history = await loadHistory(leadId, cfg.historyMessages);
  const out: GenerateOutput = await generateReply({
    kind,
    message: ctx.inboundText,
    sender: { phone: ctx.phone, firstName: firstNameOf(ctx.lead?.name) },
    history,
  });
  if (!out.ok) {
    await recordEvent(out, { origin: "webhook", phone: ctx.phone, leadId, status: "erro" }).catch(() => undefined);
    return { kind: "error", message: out.error ?? "A IA não gerou resposta." };
  }
  const sentLastHour = await autoSentLastHour(ctx.phone);
  const decision = decideDelivery({
    config: cfg,
    confidence: out.confidence,
    needsHuman: out.needsHuman,
    autoSentLastHour: sentLastHour,
  });

  if (decision.action === "auto") {
    // o evento já nasce "enviada_auto": isso reserva a cota por telefone/hora enquanto o envio acontece
    const eventId = await recordEvent(out, { origin: "webhook", phone: ctx.phone, leadId, status: "enviada_auto" });
    return {
      kind: "send",
      text: out.reply,
      done: async (error) => {
        if (!error) return;
        // o envio falhou: nada se perde, a resposta vai para a fila de revisão
        await setEventStatus(eventId, "falha_envio", error);
        await createReview({
          eventId, phone: ctx.phone, leadId, instanceId: ctx.instanceId, kind, question: ctx.inboundText,
          suggestedReply: out.reply, confidence: out.confidence, reason: `Falha ao enviar automaticamente: ${error}`, sources: out.sources,
        });
      },
    };
  }

  const eventId = await recordEvent(out, { origin: "webhook", phone: ctx.phone, leadId, status: "em_revisao" });
  const reviewId = await createReview({
    eventId, phone: ctx.phone, leadId, instanceId: ctx.instanceId, kind, question: ctx.inboundText,
    suggestedReply: out.reply, confidence: out.confidence, reason: decision.reason, sources: out.sources,
  });
  return { kind: "review", reviewId };
}

export function registerAiRules() {
  registerAiReplyGenerator(aiRuleGenerator);
}

// ---- Revisão ----

export type ReviewResult =
  | { ok: true; status: "aprovado" | "editado" | "descartado" }
  | { ok: false; code: 404 | 409 | 502; error: string };

// Aprova (com ou sem edição) e envia. "Reservar" a revisão antes de enviar evita envio duplo por clique duplo.
export async function approveReview(id: string, text: string | undefined, user: { id: string; name: string }): Promise<ReviewResult> {
  const [cur] = await db.select().from(aiReviews).where(eq(aiReviews.id, id)).limit(1);
  if (!cur) return { ok: false, code: 404, error: "Item da revisão não encontrado." };
  if (cur.status !== "pendente") return { ok: false, code: 409, error: "Este item já foi tratado." };
  const finalText = (text ?? cur.suggestedReply).trim();
  const edited = finalText !== cur.suggestedReply.trim();
  const status = edited ? "editado" : "aprovado";
  const claimed = await db
    .update(aiReviews)
    .set({ status, finalReply: finalText, reviewedBy: user.id, reviewedByName: user.name, reviewedAt: new Date(), sendError: null })
    .where(and(eq(aiReviews.id, id), eq(aiReviews.status, "pendente")))
    .returning({ id: aiReviews.id });
  if (claimed.length === 0) return { ok: false, code: 409, error: "Este item já foi tratado." };

  const error = await sendTextChecked(cur.instanceId, cur.phone, finalText);
  if (error) {
    // não enviou: volta para a fila para tentar de novo
    await db
      .update(aiReviews)
      .set({ status: "pendente", finalReply: null, reviewedBy: null, reviewedByName: null, reviewedAt: null, sendError: error })
      .where(eq(aiReviews.id, id));
    return { ok: false, code: 502, error };
  }
  await db.update(aiReviews).set({ sent: true }).where(eq(aiReviews.id, id));
  await setEventStatus(cur.eventId, edited ? "editada" : "aprovada");
  try {
    await db.insert(messageLogs).values({
      recipientId: cur.leadId,
      recipientName: null,
      recipientPhone: cur.phone,
      templateType: `IA revisada por ${user.name}`.slice(0, 100),
      message: finalText,
      status: "sent",
      direction: "out",
      instanceId: cur.instanceId,
    });
  } catch (err) {
    console.error("IA: falha ao registrar a resposta revisada", errText(err));
  }
  return { ok: true, status };
}

export async function discardReview(id: string, user: { id: string; name: string }): Promise<ReviewResult> {
  const upd = await db
    .update(aiReviews)
    .set({ status: "descartado", reviewedBy: user.id, reviewedByName: user.name, reviewedAt: new Date() })
    .where(and(eq(aiReviews.id, id), eq(aiReviews.status, "pendente")))
    .returning({ eventId: aiReviews.eventId });
  if (upd.length === 0) {
    const [cur] = await db.select({ id: aiReviews.id }).from(aiReviews).where(eq(aiReviews.id, id)).limit(1);
    return cur ? { ok: false, code: 409, error: "Este item já foi tratado." } : { ok: false, code: 404, error: "Item da revisão não encontrado." };
  }
  await setEventStatus(upd[0].eventId, "descartada");
  return { ok: true, status: "descartado" };
}

