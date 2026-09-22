import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/index";
import { keywordRuleHits, keywordRules } from "../db/schema/index";
import { getSetting } from "./settings";
import { resolveGeminiKey } from "./ai";
import { findLeadsByPhone, type LeadRow } from "./leadFunnel";
import { phoneKey, renderReplyTemplate } from "../lib/crmText";
import {
  evaluateRules, isBusinessOpen, normalizeSchedule,
  type EvaluateResult, type KeywordRule, type RuleAction,
} from "../lib/keywordRules";

export type KeywordRuleRow = typeof keywordRules.$inferSelect;

export function rowToRule(row: KeywordRuleRow): KeywordRule {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    keywords: row.keywords ?? [],
    match: row.match === "all" ? "all" : "any",
    replyBody: row.replyBody,
    action: row.action === "ai" ? "ai" : "reply",
    aiKind: (["preco", "troca", "os", "geral"] as const).find((k) => k === row.aiKind) ?? "geral",
    priority: row.priority,
    active: row.active,
    schedule: normalizeSchedule(row.schedule),
    cooldownMinutes: row.cooldownMinutes,
  };
}

export async function loadRules(): Promise<KeywordRule[]> {
  const rows = await db.select().from(keywordRules).orderBy(asc(keywordRules.priority), asc(keywordRules.createdAt));
  return rows.map(rowToRule);
}

// Telefone como fica gravado nos disparos (chave de comparação: sem DDI, com 9º dígito)
export const hitPhone = (raw: string) => phoneKey(raw);

// Último disparo de cada regra para o telefone. Contam os já respondidos E os em andamento
// (replied = false sem erro): assim duas mensagens quase juntas não geram duas respostas.
export async function lastFiredByRule(phone: string): Promise<Map<string, Date>> {
  const rows = await db
    .select({ ruleId: keywordRuleHits.ruleId, last: sql<Date>`max(${keywordRuleHits.createdAt})` })
    .from(keywordRuleHits)
    .where(
      and(
        eq(keywordRuleHits.phone, hitPhone(phone)),
        or(eq(keywordRuleHits.replied, true), and(eq(keywordRuleHits.replied, false), isNull(keywordRuleHits.error)))
      )
    )
    .groupBy(keywordRuleHits.ruleId);
  return new Map(rows.map((r) => [r.ruleId, new Date(r.last)]));
}

export interface ReplyContextSource {
  lead?: Pick<LeadRow, "name" | "modelInterest"> | null;
  fallbackName?: string;
}

export async function renderRuleReply(body: string, src: ReplyContextSource): Promise<string> {
  const store = await getSetting("store");
  return renderReplyTemplate(body, {
    name: src.lead?.name || src.fallbackName || "",
    model: src.lead?.modelInterest || "",
    storeName: store.name,
    address: store.address,
    pixKey: store.pixKey,
  });
}

// ---- Ponto de extensão da IA (Fase 5B) ----
// Uma regra com action = "ai" chama o gerador registrado aqui (services/aiRules.ts registra na inicialização).
// O gerador devolve: um texto (envia), null (nada), ou um resultado explícito:
//   { kind: "send", text, done? }  envia o texto (done recebe o erro do envio, se houver)
//   { kind: "review", reviewId }   não envia: foi para a fila de revisão da IA
//   { kind: "error", message }     não responde; o motivo fica no disparo
// Sem gerador registrado, a regra "ai" não responde e o disparo fica registrado com o motivo.
export interface AiReplyContext {
  rule: KeywordRule;
  inboundText: string;
  phone: string;
  lead: LeadRow | null;
  instanceId: string | null; // número que recebeu a mensagem
}
export type AiReplyOutcome =
  | { kind: "send"; text: string; done?: (error: string | null) => Promise<void> }
  | { kind: "review"; reviewId: string }
  | { kind: "error"; message: string };
export type AiReplyGenerator = (ctx: AiReplyContext) => Promise<string | null | AiReplyOutcome>;
let aiGenerator: AiReplyGenerator | null = null;
export function registerAiReplyGenerator(fn: AiReplyGenerator | null) {
  aiGenerator = fn;
}
export function getAiReplyGenerator(): AiReplyGenerator | null {
  return aiGenerator;
}

// ---- Simulador (não envia nada, não grava nada) ----
export interface SimulationInput {
  text: string;
  phone?: string;
  now?: Date;
}

export interface SimulationResult {
  status: EvaluateResult["status"];
  wouldSend: boolean;
  action: RuleAction | null;
  rule: { id: string; name: string; category: string; priority: number; action: RuleAction; cooldownMinutes: number } | null;
  matchedKeywords: string[];
  scheduleOk: boolean | null;
  scheduleReason: string | null;
  cooldown: { active: boolean; until: string | null };
  replyText: string | null;
  businessOpen: boolean;
  leadFound: boolean;
  considered: {
    id: string;
    name: string;
    priority: number;
    matchedKeywords: string[];
    scheduleOk: boolean;
    scheduleReason: string;
  }[];
  message: string; // explicação em português
}

const STATUS_MESSAGE: Record<EvaluateResult["status"], string> = {
  fire: "Esta regra responderia.",
  cooldown: "A regra casou, mas já respondeu a este telefone há pouco (intervalo mínimo): não responderia agora.",
  outside_schedule: "Há regra(s) que casam, mas todas estão fora do horário/período agora: nada seria enviado.",
  no_match: "Nenhuma regra ativa casou com esta mensagem: nada seria enviado.",
  no_rules: "Não há regras ativas.",
};

export async function simulate(input: SimulationInput): Promise<SimulationResult> {
  const now = input.now ?? new Date();
  const [rules, bh] = await Promise.all([loadRules(), getSetting("business_hours")]);
  const phone = (input.phone ?? "").trim();
  const last = phoneKey(phone).length >= 8 ? await lastFiredByRule(phone) : new Map<string, Date>();
  const res = evaluateRules({ text: input.text, rules, now, businessHours: bh, lastFiredAt: (id) => last.get(id) ?? null });
  const leads = phoneKey(phone).length >= 10 ? await findLeadsByPhone(phone) : [];
  const lead = leads[0] ?? null;
  const w = res.winner;
  // regra de IA: só "responderia" se a IA estiver ligada e com chave (a resposta em si só existe na hora)
  const aiCfg = w?.rule.action === "ai" ? await getSetting("ai") : null;
  const aiKey = w?.rule.action === "ai" ? await resolveGeminiKey() : null;
  const aiReady = Boolean(aiGenerator && aiCfg?.enabled && aiKey);
  // fora do horário não há vencedora: mostra a primeira regra que casou as palavras, para explicar o motivo
  const shown = w ?? (res.status === "outside_schedule" ? res.candidates[0] ?? null : null);
  let replyText: string | null = null;
  if (w && (res.status === "fire" || res.status === "cooldown")) {
    replyText =
      w.rule.action === "ai"
        ? null
        : await renderRuleReply(w.rule.replyBody, { lead });
  }
  return {
    status: res.status,
    wouldSend: res.status === "fire" && (w?.rule.action !== "ai" || aiReady),
    action: res.action,
    rule: shown
      ? { id: shown.rule.id, name: shown.rule.name, category: shown.rule.category, priority: shown.rule.priority, action: shown.rule.action, cooldownMinutes: shown.rule.cooldownMinutes }
      : null,
    matchedKeywords: shown?.matchedKeywords ?? [],
    scheduleOk: shown ? shown.schedule.ok : null,
    scheduleReason: shown ? shown.schedule.reason : null,
    cooldown: { active: Boolean(w?.cooldown.active), until: w?.cooldown.until ? w.cooldown.until.toISOString() : null },
    replyText,
    businessOpen: isBusinessOpen(bh, now),
    leadFound: Boolean(lead),
    considered: res.candidates.map((c) => ({
      id: c.rule.id,
      name: c.rule.name,
      priority: c.rule.priority,
      matchedKeywords: c.matchedKeywords,
      scheduleOk: c.schedule.ok,
      scheduleReason: c.schedule.reason,
    })),
    message:
      res.status === "fire" && w?.rule.action === "ai"
        ? !aiCfg?.enabled
          ? "A regra é de IA, mas a IA está desligada (IA no Atendimento › Configuração): nada seria enviado."
          : !aiKey
            ? "A regra é de IA, mas falta a chave GEMINI_API_KEY (Configurações › Variáveis): nada seria enviado."
            : aiCfg.autoSend
              ? "A regra é de IA: o Gemini geraria a resposta na hora e ela sairia sozinha se a confiança for alta; senão iria para a fila de revisão."
              : "A regra é de IA: o Gemini geraria a resposta na hora e ela iria para a fila de revisão (o envio automático está desligado)."
        : STATUS_MESSAGE[res.status],
  };
}
