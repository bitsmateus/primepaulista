// Motor PURO das respostas automáticas por palavra-chave (Fase 5A).
//
// ATENÇÃO: este arquivo existe em DOIS lugares, com conteúdo IDÊNTICO: server/src/lib/keywordRules.ts e
// src/lib/keywordRules.ts (a API é implantada separada do site). O teste src/test/crmSync.test.ts compara
// as duas cópias e roda os mesmos casos nelas. Ao mudar, altere as DUAS. Arquivo puro (sem imports) de propósito.
//
// Regras de casamento (resumo; tudo abaixo é testado):
//  - Texto e palavras-chave são normalizados: minúsculas, sem acento, pontuação vira espaço.
//  - Por padrão a palavra-chave casa a PALAVRA (ou frase) INTEIRA: "preço" casa "qual o preço?" mas
//    não "preços". Um "*" no fim libera o resto da palavra ("garant*" casa garantia/garantido); um "*"
//    no começo libera o início; "*trecho*" casa em qualquer pedaço.
//  - match "any": basta UMA palavra-chave; "all": TODAS precisam aparecer.
//  - Regras ativas são avaliadas por prioridade (menor número = mais prioritária); a PRIMEIRA que casa
//    palavras E está dentro do horário vence. Regra que casa mas está fora do horário é pulada.
//  - Cooldown: a regra vencedora não responde de novo ao mesmo telefone dentro do intervalo.
//  - Ponto de extensão da IA (Fase 5B): o resultado devolve { winner, action }; quando action = "ai"
//    o webhook chama o gerador de resposta registrado em services/keywordReplies.ts.

export const TZ = "America/Sao_Paulo";

export const RULE_CATEGORIES = ["Preço", "Garantia", "Endereço", "Pagamento", "Troca", "Orçamento", "Pós-venda", "Outro"] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

export type RuleMode = "always" | "business_hours" | "outside_hours" | "window";
export type RuleAction = "reply" | "ai";

export interface RuleSchedule {
  mode: RuleMode;
  days: number[]; // 0 = domingo ... 6 = sábado (usado no modo "window")
  from: string; // "HH:MM" (modo "window")
  to: string; // "HH:MM" (fim exclusivo; "23:59" vale até o fim do dia)
  startDate: string | null; // "YYYY-MM-DD": início do período de campanha (qualquer modo)
  endDate: string | null; // "YYYY-MM-DD": fim do período de campanha, inclusive
}

export interface BusinessHours {
  ranges: { day: number; from: string; to: string }[]; // day: 0 = domingo ... 6 = sábado
}

export const DEFAULT_SCHEDULE: RuleSchedule = {
  mode: "always",
  days: [0, 1, 2, 3, 4, 5, 6],
  from: "09:00",
  to: "19:00",
  startDate: null,
  endDate: null,
};

// Padrão: segunda a sábado, das 09:00 às 19:00
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  ranges: [1, 2, 3, 4, 5, 6].map((day) => ({ day, from: "09:00", to: "19:00" })),
};

export interface KeywordRule {
  id: string;
  name: string;
  category: string;
  keywords: string[];
  match: "any" | "all";
  replyBody: string;
  action: RuleAction;
  priority: number;
  active: boolean;
  schedule: RuleSchedule;
  cooldownMinutes: number;
}

// ---- Normalização ----
export function normalizeText(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Palavra-chave -> { texto normalizado, curinga no começo, curinga no fim }
export function parseKeyword(raw: string): { text: string; before: boolean; after: boolean } | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const text = normalizeText(t);
  if (!text) return null;
  return { text, before: t.startsWith("*"), after: t.endsWith("*") };
}

export function keywordMatches(normalizedText: string, keyword: string): boolean {
  const k = parseKeyword(keyword);
  if (!k) return false;
  const hay = ` ${normalizedText} `;
  const needle = `${k.before ? "" : " "}${k.text}${k.after ? "" : " "}`;
  return hay.includes(needle);
}

export function matchKeywords(
  text: string,
  keywords: string[],
  mode: "any" | "all"
): { matched: boolean; matchedKeywords: string[] } {
  const norm = normalizeText(text);
  const valid = keywords.filter((k) => parseKeyword(k));
  if (!norm || valid.length === 0) return { matched: false, matchedKeywords: [] };
  const hits = valid.filter((k) => keywordMatches(norm, k));
  const matched = mode === "all" ? hits.length === valid.length : hits.length > 0;
  return { matched, matchedKeywords: matched ? hits.map((k) => k.trim()) : [] };
}

// ---- Horário (sempre no fuso de São Paulo) ----
export function timeToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi !== 0)) return null;
  return h * 60 + mi;
}

export interface ZonedParts {
  date: string; // YYYY-MM-DD no fuso
  dow: number; // 0 = domingo ... 6 = sábado
  minutes: number; // minutos desde 00:00 no fuso
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(now: Date, tz: string = TZ): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) p[part.type] = part.value;
  const hour = Number(p.hour) % 24;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    dow: WEEKDAYS[p.weekday] ?? 0,
    minutes: hour * 60 + Number(p.minute),
  };
}

// Faixa [from, to) em minutos; from > to atravessa a meia-noite; "23:59" vale até o fim do dia.
// Devolve { inside, dayOffset }: dayOffset = -1 quando estamos na madrugada de uma faixa que começou ontem.
function inRange(minutes: number, from: string, to: string): { inside: boolean; yesterday: boolean } {
  const f = timeToMinutes(from);
  let t = timeToMinutes(to);
  if (f === null || t === null || f === t) return { inside: false, yesterday: false };
  if (to.trim() === "23:59") t = 1440;
  if (f < t) return { inside: minutes >= f && minutes < t, yesterday: false };
  if (minutes >= f) return { inside: true, yesterday: false };
  if (minutes < t) return { inside: true, yesterday: true };
  return { inside: false, yesterday: false };
}

export function isBusinessOpen(bh: BusinessHours, now: Date): boolean {
  const z = zonedParts(now);
  for (const r of bh.ranges) {
    const res = inRange(z.minutes, r.from, r.to);
    if (!res.inside) continue;
    const day = res.yesterday ? (z.dow + 6) % 7 : z.dow;
    if (r.day === day) return true;
  }
  return false;
}

const brDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export function checkSchedule(schedule: RuleSchedule, bh: BusinessHours, now: Date): { ok: boolean; reason: string } {
  const z = zonedParts(now);
  if (schedule.startDate && z.date < schedule.startDate) {
    return { ok: false, reason: `Fora do período da campanha (começa em ${brDate(schedule.startDate)})` };
  }
  if (schedule.endDate && z.date > schedule.endDate) {
    return { ok: false, reason: `Fora do período da campanha (terminou em ${brDate(schedule.endDate)})` };
  }
  switch (schedule.mode) {
    case "always":
      return { ok: true, reason: "Sem restrição de horário" };
    case "business_hours":
      return isBusinessOpen(bh, now)
        ? { ok: true, reason: "Dentro do horário comercial" }
        : { ok: false, reason: "Fora do horário comercial (a regra só responde dentro dele)" };
    case "outside_hours":
      return isBusinessOpen(bh, now)
        ? { ok: false, reason: "Dentro do horário comercial (a regra só responde fora dele)" }
        : { ok: true, reason: "Fora do horário comercial" };
    case "window": {
      const res = inRange(z.minutes, schedule.from, schedule.to);
      if (!res.inside) return { ok: false, reason: `Fora da janela de ${schedule.from} às ${schedule.to}` };
      const day = res.yesterday ? (z.dow + 6) % 7 : z.dow;
      if (!schedule.days.includes(day)) return { ok: false, reason: "Dia da semana fora dos dias da regra" };
      return { ok: true, reason: `Dentro da janela de ${schedule.from} às ${schedule.to}` };
    }
    default:
      return { ok: true, reason: "Sem restrição de horário" };
  }
}

// Lê o agendamento salvo (jsonb) com tolerância: campo faltando/errado cai no padrão
export function normalizeSchedule(raw: unknown): RuleSchedule {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode: RuleMode = ["always", "business_hours", "outside_hours", "window"].includes(o.mode as string)
    ? (o.mode as RuleMode)
    : "always";
  const days = Array.isArray(o.days)
    ? [...new Set((o.days as unknown[]).filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort()
    : DEFAULT_SCHEDULE.days;
  const time = (v: unknown, fb: string) => (typeof v === "string" && timeToMinutes(v) !== null ? v : fb);
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    mode,
    days,
    from: time(o.from, DEFAULT_SCHEDULE.from),
    to: time(o.to, DEFAULT_SCHEDULE.to),
    startDate: date(o.startDate),
    endDate: date(o.endDate),
  };
}

// ---- Avaliação ----
export interface RuleCandidate {
  rule: KeywordRule;
  matchedKeywords: string[];
  schedule: { ok: boolean; reason: string };
  cooldown: { active: boolean; until: Date | null };
}

export type EvaluateStatus = "fire" | "cooldown" | "outside_schedule" | "no_match" | "no_rules";

export interface EvaluateResult {
  status: EvaluateStatus;
  winner: RuleCandidate | null; // regra vencedora (também quando barrada pelo cooldown)
  action: RuleAction | null; // o que fazer: "reply" (texto da regra) ou "ai" (Fase 5B); null se nada será enviado
  candidates: RuleCandidate[]; // todas as regras ativas que casaram as palavras, em ordem de prioridade
  normalizedText: string;
}

export interface EvaluateInput {
  text: string;
  rules: KeywordRule[];
  now: Date;
  businessHours: BusinessHours;
  // Data do último disparo da regra para este telefone (ou null)
  lastFiredAt?: (ruleId: string) => Date | null;
}

export function evaluateRules(input: EvaluateInput): EvaluateResult {
  const normalizedText = normalizeText(input.text);
  const active = input.rules.filter((r) => r.active);
  if (active.length === 0) return { status: "no_rules", winner: null, action: null, candidates: [], normalizedText };

  // ordenação estável por prioridade
  const sorted = active
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.priority - b.r.priority || a.i - b.i)
    .map((x) => x.r);

  const candidates: RuleCandidate[] = [];
  for (const rule of sorted) {
    const m = matchKeywords(input.text, rule.keywords, rule.match);
    if (!m.matched) continue;
    const schedule = checkSchedule(rule.schedule, input.businessHours, input.now);
    let cooldown: RuleCandidate["cooldown"] = { active: false, until: null };
    const last = input.lastFiredAt?.(rule.id) ?? null;
    if (last && rule.cooldownMinutes > 0) {
      const until = new Date(last.getTime() + rule.cooldownMinutes * 60_000);
      if (until.getTime() > input.now.getTime()) cooldown = { active: true, until };
    }
    candidates.push({ rule, matchedKeywords: m.matchedKeywords, schedule, cooldown });
  }
  if (candidates.length === 0) return { status: "no_match", winner: null, action: null, candidates, normalizedText };

  const winner = candidates.find((c) => c.schedule.ok) ?? null;
  if (!winner) return { status: "outside_schedule", winner: null, action: null, candidates, normalizedText };
  if (winner.cooldown.active) return { status: "cooldown", winner, action: null, candidates, normalizedText };
  return { status: "fire", winner, action: winner.rule.action, candidates, normalizedText };
}
