import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index";
import { keywordRuleHits, messageLogs, type WhatsappInstance } from "../db/schema/index";
import { callUazapi, getInstance } from "./whatsapp";
import { normalizePhone } from "./osNotifications";
import { getSetting } from "./settings";
import { findOrCreateLeadByPhone, type LeadRow } from "./leadFunnel";
import { getAiReplyGenerator, hitPhone, lastFiredByRule, loadRules, renderRuleReply } from "./keywordReplies";
import { evaluateRules, type KeywordRule } from "../lib/keywordRules";
import { phoneKey } from "../lib/crmText";
import { parseWebhookPayload, type InboundMessage } from "../lib/webhookParser";

// Entrada de mensagens do WhatsApp (webhook do Uazapi): registra a mensagem, acha/cria o lead e,
// se uma regra de palavra-chave casar, responde pela MESMA instância que recebeu a mensagem.
//
// Garantias:
//  - idempotente por (instância, id da mensagem): reenvio do provedor não duplica nada;
//  - ignora mensagens do próprio número (fromMe / enviadas pela API), de grupos e sem telefone;
//  - NUNCA lança: cada mensagem tem o seu try/catch (o webhook responde 200 mesmo com falha interna);
//  - a resposta automática sai em segundo plano (o webhook responde rápido); o resultado fica no disparo.

export type InboundResult =
  | "processed"
  | "duplicate"
  | "own_message"
  | "group"
  | "no_phone"
  | "error";

// Serializa o tratamento de mensagens do MESMO telefone (evita lead duplicado e resposta dupla
// quando o cliente manda duas mensagens quase juntas). Vale para uma única cópia da API.
const locks = new Map<string, Promise<unknown>>();
async function withPhoneLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  locks.set(key, tail);
  try {
    return await run;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

interface DeliveryPlan {
  hitId: string;
  rule: KeywordRule;
  lead: LeadRow;
  phone: string; // como veio do provedor (só dígitos)
  inboundText: string;
}

// Envia a resposta automática e registra o resultado no disparo. Nunca lança.
async function deliver(instanceId: string, plan: DeliveryPlan): Promise<void> {
  let error: string | null = null;
  let text = "";
  try {
    if (plan.rule.action === "ai") {
      const gen = getAiReplyGenerator();
      if (!gen) {
        error = "Regra de IA: recurso ainda não disponível (Fase 5B).";
      } else {
        const out = await gen({ rule: plan.rule, inboundText: plan.inboundText, phone: plan.phone, lead: plan.lead });
        if (!out || !out.trim()) error = "A IA não gerou resposta.";
        else text = out.trim();
      }
    } else {
      text = await renderRuleReply(plan.rule.replyBody, { lead: plan.lead });
      if (!text) error = "Texto da resposta vazio.";
    }

    const inst = error ? null : await getInstance(instanceId);
    if (!error) {
      if (!inst || !inst.instanceUrl || !inst.apiKey) error = "Número de WhatsApp não configurado.";
      else if (!inst.active) error = "Número de WhatsApp inativo.";
    }
    if (!error && inst) {
      let connected = false;
      try {
        const st = await callUazapi(inst, "/instance/status", "GET");
        const state = String(st.data?.state || st.data?.status || "").toLowerCase();
        connected = st.ok && (state === "open" || state === "connected");
      } catch {
        connected = false;
      }
      if (!connected) {
        error = "WhatsApp desconectado (leia o QR Code na aba WhatsApp).";
      } else {
        try {
          const r = await callUazapi(inst, "/message/text", "POST", { number: normalizePhone(plan.phone), text });
          if (!r.ok) error = `O provedor recusou o envio (HTTP ${r.status}).`;
        } catch (err) {
          error = `Falha de comunicação com o provedor: ${errText(err)}`.slice(0, 300);
        }
      }
    }
  } catch (err) {
    error = `Falha ao responder: ${errText(err)}`.slice(0, 300);
  }

  try {
    await db
      .update(keywordRuleHits)
      .set({ replied: error === null, error })
      .where(eq(keywordRuleHits.id, plan.hitId));
    if (text) {
      await db.insert(messageLogs).values({
        recipientId: plan.lead.id,
        recipientName: plan.lead.name,
        recipientPhone: plan.phone,
        templateType: `Automática: ${plan.rule.name}`.slice(0, 100),
        message: text,
        status: error === null ? "sent" : "failed",
        direction: "out",
        instanceId,
      });
    }
  } catch (err) {
    console.error("falha ao registrar resposta automática", errText(err));
  }
}

// Idempotência: o id da mensagem; sem id, uma impressão digital (só se houver horário da mensagem)
function externalIdOf(m: InboundMessage, display: string): string | null {
  if (m.id) return m.id.slice(0, 200);
  if (m.timestamp) return "h:" + createHash("sha1").update(`${m.phone}|${display}|${m.timestamp}`).digest("hex");
  return null;
}

async function processOne(inst: WhatsappInstance, m: InboundMessage): Promise<{ result: InboundResult; deliver?: () => Promise<void> }> {
  if (m.fromMe || m.wasSentByApi) return { result: "own_message" };
  if (m.isGroup) return { result: "group" };
  if (!m.phone || phoneKey(m.phone).length < 8) return { result: "no_phone" };
  if (m.owner && phoneKey(m.owner) === phoneKey(m.phone)) return { result: "own_message" };

  const text = m.text.trim();
  const display = text || `[${m.type || "mídia"}]`;
  const extId = externalIdOf(m, display);
  const key = phoneKey(m.phone);

  let plan: DeliveryPlan | null = null;
  const outcome = await withPhoneLock(key, async (): Promise<InboundResult> => {
    if (extId) {
      const dup = await db
        .select({ id: messageLogs.id })
        .from(messageLogs)
        .where(and(eq(messageLogs.instanceId, inst.id), eq(messageLogs.externalId, extId)))
        .limit(1);
      if (dup.length > 0) return "duplicate";
    }

    const { lead } = await findOrCreateLeadByPhone({ phone: m.phone, name: m.name, origin: "WhatsApp" });
    const inserted = await db
      .insert(messageLogs)
      .values({
        recipientId: lead.id,
        recipientName: lead.name,
        recipientPhone: m.phone,
        templateType: "Recebida",
        message: display,
        status: "sent",
        direction: "in",
        externalId: extId,
        instanceId: inst.id,
      })
      .onConflictDoNothing()
      .returning({ id: messageLogs.id });
    if (inserted.length === 0) return "duplicate";
    if (!text) return "processed";

    // Regras de palavra-chave (a primeira que casa e está no horário vence)
    const [rules, bh, last] = await Promise.all([loadRules(), getSetting("business_hours"), lastFiredByRule(m.phone)]);
    const res = evaluateRules({ text, rules, now: new Date(), businessHours: bh, lastFiredAt: (id) => last.get(id) ?? null });
    if (res.status === "fire" && res.winner) {
      const [hit] = await db
        .insert(keywordRuleHits)
        .values({
          ruleId: res.winner.rule.id,
          phone: hitPhone(m.phone),
          leadId: lead.id,
          inboundText: text.slice(0, 1000),
          matched: res.winner.matchedKeywords.join(", ").slice(0, 300),
          replied: false,
        })
        .returning({ id: keywordRuleHits.id });
      plan = { hitId: hit.id, rule: res.winner.rule, lead, phone: m.phone, inboundText: text };
    }
    return "processed";
  });

  if (outcome === "processed" && plan) {
    const p = plan as DeliveryPlan;
    return { result: "processed", deliver: () => deliver(inst.id, p) };
  }
  return { result: outcome };
}

export interface WebhookOutcome {
  received: number;
  results: InboundResult[];
}

// Ponto de entrada do webhook. Nunca lança.
export async function handleInboundPayload(inst: WhatsappInstance, payload: unknown): Promise<WebhookOutcome> {
  const results: InboundResult[] = [];
  let parsed;
  try {
    parsed = parseWebhookPayload(payload);
  } catch {
    return { received: 0, results };
  }
  for (const m of parsed.messages) {
    try {
      const r = await processOne(inst, m);
      results.push(r.result);
      // resposta em segundo plano: o webhook não espera o provedor
      if (r.deliver) void r.deliver().catch((err) => console.error("resposta automática", errText(err)));
    } catch (err) {
      results.push("error");
      console.error("webhook: falha ao tratar mensagem", errText(err));
    }
  }
  return { received: parsed.messages.length, results };
}
