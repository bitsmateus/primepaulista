import { describe, it, expect } from "vitest";
import {
  DEFAULT_BUSINESS_HOURS, DEFAULT_SCHEDULE, checkSchedule, evaluateRules, isBusinessOpen, keywordMatches,
  matchKeywords, normalizeSchedule, normalizeText, parseKeyword, timeToMinutes, zonedParts,
  type BusinessHours, type KeywordRule, type RuleSchedule,
} from "@/lib/keywordRules";

// São Paulo = UTC-3 o ano todo (sem horário de verão desde 2019)
// 10/03/2026 é terça-feira
const at = (iso: string) => new Date(`${iso}-03:00`);
const TUE_NOON = at("2026-03-10T12:00:00");

const sched = (over: Partial<RuleSchedule> = {}): RuleSchedule => ({ ...DEFAULT_SCHEDULE, ...over });
const rule = (over: Partial<KeywordRule> = {}): KeywordRule => ({
  id: "r1", name: "Regra", category: "Preço", keywords: ["preço"], match: "any", replyBody: "ok", action: "reply",
  priority: 1, active: true, schedule: sched(), cooldownMinutes: 60, ...over,
});

describe("normalização de texto", () => {
  it("tira acentos, põe minúsculas e troca pontuação por espaço", () => {
    expect(normalizeText("  Qual o PREÇO do iPhone 15?!  ")).toBe("qual o preco do iphone 15");
    expect(normalizeText("Ação, garantia… não")).toBe("acao garantia nao");
    expect(normalizeText("R$ 1.500,00")).toBe("r 1 500 00");
  });
  it("texto vazio ou só símbolos vira vazio", () => {
    expect(normalizeText("")).toBe("");
    expect(normalizeText("?!?! ...")).toBe("");
  });
  it("emoji some", () => {
    expect(normalizeText("oi 😀 preço")).toBe("oi preco");
  });
});

describe("palavra-chave", () => {
  it("parseKeyword lê os curingas nas pontas", () => {
    expect(parseKeyword("garant*")).toEqual({ text: "garant", before: false, after: true });
    expect(parseKeyword("*fone")).toEqual({ text: "fone", before: true, after: false });
    expect(parseKeyword("*trecho*")).toEqual({ text: "trecho", before: true, after: true });
    expect(parseKeyword("  Preço ")).toEqual({ text: "preco", before: false, after: false });
    expect(parseKeyword("")).toBeNull();
    expect(parseKeyword("***")).toBeNull();
  });
  it("casa a palavra inteira, ignorando acento e maiúsculas", () => {
    const t = normalizeText("Qual o PREÇO do iPhone?");
    expect(keywordMatches(t, "preço")).toBe(true);
    expect(keywordMatches(t, "preco")).toBe(true);
    expect(keywordMatches(t, "PREÇO")).toBe(true);
    expect(keywordMatches(t, "iphone")).toBe(true);
  });
  it("não casa pedaço de outra palavra sem curinga", () => {
    expect(keywordMatches(normalizeText("os preços estão altos"), "preço")).toBe(false);
    expect(keywordMatches(normalizeText("pixel novo"), "pix")).toBe(false);
    expect(keywordMatches(normalizeText("telefone"), "fone")).toBe(false);
  });
  it("curinga no fim casa o resto da palavra", () => {
    expect(keywordMatches(normalizeText("tem garantia?"), "garant*")).toBe(true);
    expect(keywordMatches(normalizeText("é garantido"), "garant*")).toBe(true);
    expect(keywordMatches(normalizeText("sem garan"), "garant*")).toBe(false);
  });
  it("curinga no começo e nos dois lados", () => {
    expect(keywordMatches(normalizeText("meu telefone"), "*fone")).toBe(true);
    expect(keywordMatches(normalizeText("meu iphone"), "*phone")).toBe(true);
    expect(keywordMatches(normalizeText("telefones baratos"), "*fone")).toBe(false);
    expect(keywordMatches(normalizeText("telefones baratos"), "*fone*")).toBe(true);
  });
  it("frases (várias palavras) casam em sequência", () => {
    const t = normalizeText("Quais as formas de pagamento?");
    expect(keywordMatches(t, "formas de pagamento")).toBe(true);
    expect(keywordMatches(t, "pagamento de formas")).toBe(false);
  });
  it("palavra na primeira e na última posição", () => {
    expect(keywordMatches(normalizeText("preço"), "preço")).toBe(true);
    expect(keywordMatches(normalizeText("preço do iphone"), "preço")).toBe(true);
    expect(keywordMatches(normalizeText("qual o preço"), "preço")).toBe(true);
  });
  it("keyword vazia nunca casa", () => {
    expect(keywordMatches("qualquer coisa", "")).toBe(false);
    expect(keywordMatches("qualquer coisa", "?!")).toBe(false);
  });
});

describe("any / all", () => {
  it("any: basta uma palavra e devolve só as que casaram", () => {
    const r = matchKeywords("quanto custa o valor?", ["preço", "valor", "custa"], "any");
    expect(r.matched).toBe(true);
    expect(r.matchedKeywords).toEqual(["valor", "custa"]);
  });
  it("any: nenhuma casa", () => {
    expect(matchKeywords("bom dia", ["preço", "valor"], "any")).toEqual({ matched: false, matchedKeywords: [] });
  });
  it("all: precisa de todas", () => {
    expect(matchKeywords("preço do iphone 15", ["preço", "iphone"], "all").matched).toBe(true);
    expect(matchKeywords("preço do galaxy", ["preço", "iphone"], "all").matched).toBe(false);
  });
  it("lista vazia ou só de símbolos não casa", () => {
    expect(matchKeywords("oi", [], "any").matched).toBe(false);
    expect(matchKeywords("oi", ["?", "*"], "all").matched).toBe(false);
  });
  it("texto vazio não casa", () => {
    expect(matchKeywords("", ["oi"], "any").matched).toBe(false);
    expect(matchKeywords("...", ["oi"], "any").matched).toBe(false);
  });
  it("all ignora palavra-chave inválida (símbolos) no meio", () => {
    expect(matchKeywords("preço", ["preço", "?"], "all").matched).toBe(true);
  });
});

describe("fuso e horário", () => {
  it("timeToMinutes", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("9:05")).toBe(545);
    expect(timeToMinutes("24:00")).toBe(1440);
    expect(timeToMinutes("24:01")).toBeNull();
    expect(timeToMinutes("25:00")).toBeNull();
    expect(timeToMinutes("10:60")).toBeNull();
    expect(timeToMinutes("abc")).toBeNull();
    expect(timeToMinutes("")).toBeNull();
  });
  it("zonedParts usa São Paulo", () => {
    // 02:30 UTC de 11/03 = 23:30 de 10/03 em São Paulo (terça)
    expect(zonedParts(new Date("2026-03-11T02:30:00Z"))).toEqual({ date: "2026-03-10", dow: 2, minutes: 23 * 60 + 30 });
    expect(zonedParts(new Date("2026-03-10T03:00:00Z"))).toEqual({ date: "2026-03-10", dow: 2, minutes: 0 });
    expect(zonedParts(new Date("2026-03-10T02:59:00Z"))).toEqual({ date: "2026-03-09", dow: 1, minutes: 23 * 60 + 59 });
  });
  it("meia-noite não vira 24:00", () => {
    expect(zonedParts(new Date("2026-03-10T03:00:00Z")).minutes).toBe(0);
  });
});

describe("horário comercial (padrão seg-sáb 09-19)", () => {
  const bh = DEFAULT_BUSINESS_HOURS;
  it("dentro em dia útil", () => {
    expect(isBusinessOpen(bh, TUE_NOON)).toBe(true);
    expect(isBusinessOpen(bh, at("2026-03-10T09:00:00"))).toBe(true);
    expect(isBusinessOpen(bh, at("2026-03-10T18:59:00"))).toBe(true);
  });
  it("fim é exclusivo e antes da abertura é fora", () => {
    expect(isBusinessOpen(bh, at("2026-03-10T19:00:00"))).toBe(false);
    expect(isBusinessOpen(bh, at("2026-03-10T08:59:00"))).toBe(false);
  });
  it("sábado abre, domingo fecha", () => {
    expect(isBusinessOpen(bh, at("2026-03-14T10:00:00"))).toBe(true); // sábado
    expect(isBusinessOpen(bh, at("2026-03-15T10:00:00"))).toBe(false); // domingo
  });
  it("sem faixas = sempre fechado", () => {
    expect(isBusinessOpen({ ranges: [] }, TUE_NOON)).toBe(false);
  });
  it("mais de uma faixa no mesmo dia (almoço)", () => {
    const b: BusinessHours = { ranges: [{ day: 2, from: "09:00", to: "12:00" }, { day: 2, from: "14:00", to: "18:00" }] };
    expect(isBusinessOpen(b, at("2026-03-10T10:00:00"))).toBe(true);
    expect(isBusinessOpen(b, at("2026-03-10T13:00:00"))).toBe(false);
    expect(isBusinessOpen(b, at("2026-03-10T15:00:00"))).toBe(true);
  });
  it("faixa que atravessa a meia-noite conta para o dia em que começou", () => {
    const b: BusinessHours = { ranges: [{ day: 5, from: "22:00", to: "02:00" }] }; // sexta 22h -> sábado 2h
    expect(isBusinessOpen(b, at("2026-03-13T23:00:00"))).toBe(true); // sexta 23h
    expect(isBusinessOpen(b, at("2026-03-14T01:00:00"))).toBe(true); // sábado 1h
    expect(isBusinessOpen(b, at("2026-03-14T03:00:00"))).toBe(false);
    expect(isBusinessOpen(b, at("2026-03-14T23:00:00"))).toBe(false); // sábado 23h não
  });
  it('"23:59" vale até o fim do dia', () => {
    const b: BusinessHours = { ranges: [{ day: 2, from: "00:00", to: "23:59" }] };
    expect(isBusinessOpen(b, at("2026-03-10T23:59:00"))).toBe(true);
  });
  it("faixa com início = fim é ignorada", () => {
    expect(isBusinessOpen({ ranges: [{ day: 2, from: "09:00", to: "09:00" }] }, TUE_NOON)).toBe(false);
  });
});

describe("agendamento da regra", () => {
  const bh = DEFAULT_BUSINESS_HOURS;
  it("always", () => {
    expect(checkSchedule(sched(), bh, TUE_NOON).ok).toBe(true);
    expect(checkSchedule(sched(), bh, at("2026-03-15T03:00:00")).ok).toBe(true);
  });
  it("business_hours / outside_hours são opostos", () => {
    const inside = TUE_NOON, outside = at("2026-03-10T21:00:00");
    expect(checkSchedule(sched({ mode: "business_hours" }), bh, inside).ok).toBe(true);
    expect(checkSchedule(sched({ mode: "business_hours" }), bh, outside).ok).toBe(false);
    expect(checkSchedule(sched({ mode: "outside_hours" }), bh, inside).ok).toBe(false);
    expect(checkSchedule(sched({ mode: "outside_hours" }), bh, outside).ok).toBe(true);
  });
  it("motivo em português", () => {
    expect(checkSchedule(sched({ mode: "business_hours" }), bh, at("2026-03-15T12:00:00")).reason).toMatch(/Fora do horário comercial/);
    expect(checkSchedule(sched({ mode: "outside_hours" }), bh, TUE_NOON).reason).toMatch(/Dentro do horário comercial/);
  });
  it("window: dias e horas", () => {
    const s = sched({ mode: "window", days: [1, 2], from: "10:00", to: "12:00" });
    expect(checkSchedule(s, bh, TUE_NOON).ok).toBe(false); // 12:00 é o fim (exclusivo)
    expect(checkSchedule(s, bh, at("2026-03-10T11:59:00")).ok).toBe(true);
    expect(checkSchedule(s, bh, at("2026-03-10T10:00:00")).ok).toBe(true);
    expect(checkSchedule(s, bh, at("2026-03-10T09:59:00")).ok).toBe(false);
    expect(checkSchedule(s, bh, at("2026-03-11T11:00:00")).ok).toBe(false); // quarta não
    expect(checkSchedule(s, bh, at("2026-03-11T11:00:00")).reason).toMatch(/Dia da semana/);
  });
  it("window que atravessa a meia-noite usa o dia de início", () => {
    const s = sched({ mode: "window", days: [5], from: "22:00", to: "06:00" }); // só sexta (início)
    expect(checkSchedule(s, bh, at("2026-03-13T23:00:00")).ok).toBe(true); // sexta 23h
    expect(checkSchedule(s, bh, at("2026-03-14T03:00:00")).ok).toBe(true); // sábado 3h (madrugada da sexta)
    expect(checkSchedule(s, bh, at("2026-03-14T23:00:00")).ok).toBe(false); // sábado 23h (sábado não está nos dias)
    expect(checkSchedule(s, bh, at("2026-03-13T03:00:00")).ok).toBe(false); // sexta 3h (madrugada de quinta)
  });
  it("window com início = fim nunca vale", () => {
    expect(checkSchedule(sched({ mode: "window", from: "10:00", to: "10:00" }), bh, TUE_NOON).ok).toBe(false);
  });
  it("período de campanha: inclusivo nas duas pontas", () => {
    const s = sched({ startDate: "2026-11-25", endDate: "2026-11-30" });
    expect(checkSchedule(s, bh, at("2026-11-24T23:59:00")).ok).toBe(false);
    expect(checkSchedule(s, bh, at("2026-11-25T00:00:00")).ok).toBe(true);
    expect(checkSchedule(s, bh, at("2026-11-30T23:59:00")).ok).toBe(true);
    expect(checkSchedule(s, bh, at("2026-12-01T00:00:00")).ok).toBe(false);
    expect(checkSchedule(s, bh, at("2026-11-24T12:00:00")).reason).toMatch(/começa em 25\/11/);
    expect(checkSchedule(s, bh, at("2026-12-01T12:00:00")).reason).toMatch(/terminou em 30\/11/);
  });
  it("período usa a data de São Paulo (fim de noite ainda é o mesmo dia)", () => {
    // 01/12 01:30 UTC = 30/11 22:30 em São Paulo: ainda dentro da campanha
    const s = sched({ startDate: "2026-11-25", endDate: "2026-11-30" });
    expect(checkSchedule(s, bh, new Date("2026-12-01T01:30:00Z")).ok).toBe(true);
  });
  it("só início ou só fim", () => {
    expect(checkSchedule(sched({ startDate: "2026-03-11" }), bh, TUE_NOON).ok).toBe(false);
    expect(checkSchedule(sched({ endDate: "2026-03-09" }), bh, TUE_NOON).ok).toBe(false);
    expect(checkSchedule(sched({ endDate: "2026-03-10" }), bh, TUE_NOON).ok).toBe(true);
  });
  it("período vale junto com o modo de horário", () => {
    const s = sched({ mode: "business_hours", startDate: "2026-03-01", endDate: "2026-03-31" });
    expect(checkSchedule(s, bh, TUE_NOON).ok).toBe(true);
    expect(checkSchedule(s, bh, at("2026-03-10T22:00:00")).ok).toBe(false);
    expect(checkSchedule(s, bh, at("2026-04-01T12:00:00")).ok).toBe(false);
  });
  it("normalizeSchedule aceita lixo e cai no padrão", () => {
    expect(normalizeSchedule(null)).toEqual(DEFAULT_SCHEDULE);
    expect(normalizeSchedule({})).toEqual(DEFAULT_SCHEDULE);
    expect(normalizeSchedule("x")).toEqual(DEFAULT_SCHEDULE);
    const n = normalizeSchedule({ mode: "window", days: [9, 1, 1, "a", 3], from: "99:00", to: "20:00", startDate: "amanhã", endDate: "2026-12-25" });
    expect(n).toEqual({ mode: "window", days: [1, 3], from: "09:00", to: "20:00", startDate: null, endDate: "2026-12-25" });
    expect(normalizeSchedule({ mode: "voando" }).mode).toBe("always");
  });
});

describe("avaliação das regras", () => {
  const bh = DEFAULT_BUSINESS_HOURS;
  const ev = (text: string, rules: KeywordRule[], extra: Partial<Parameters<typeof evaluateRules>[0]> = {}) =>
    evaluateRules({ text, rules, now: TUE_NOON, businessHours: bh, ...extra });

  it("sem regras ativas", () => {
    expect(ev("preço", []).status).toBe("no_rules");
    expect(ev("preço", [rule({ active: false })]).status).toBe("no_rules");
  });
  it("nenhuma casa", () => {
    const r = ev("bom dia", [rule()]);
    expect(r.status).toBe("no_match");
    expect(r.winner).toBeNull();
    expect(r.action).toBeNull();
  });
  it("casa e dispara", () => {
    const r = ev("qual o preço?", [rule()]);
    expect(r.status).toBe("fire");
    expect(r.winner?.rule.id).toBe("r1");
    expect(r.winner?.matchedKeywords).toEqual(["preço"]);
    expect(r.action).toBe("reply");
    expect(r.normalizedText).toBe("qual o preco");
  });
  it("regra inativa é ignorada mesmo casando", () => {
    const r = ev("preço", [rule({ id: "a", active: false }), rule({ id: "b", priority: 5 })]);
    expect(r.winner?.rule.id).toBe("b");
  });
  it("primeira regra que casa vence: menor número de prioridade", () => {
    const rules = [rule({ id: "b", priority: 2 }), rule({ id: "a", priority: 1 }), rule({ id: "c", priority: 3 })];
    const r = ev("preço", rules);
    expect(r.winner?.rule.id).toBe("a");
    expect(r.candidates.map((c) => c.rule.id)).toEqual(["a", "b", "c"]);
  });
  it("empate de prioridade mantém a ordem da lista", () => {
    const r = ev("preço", [rule({ id: "x", priority: 1 }), rule({ id: "y", priority: 1 })]);
    expect(r.winner?.rule.id).toBe("x");
  });
  it("a regra mais prioritária que NÃO casa é pulada", () => {
    const rules = [rule({ id: "a", priority: 1, keywords: ["garantia"] }), rule({ id: "b", priority: 2 })];
    expect(ev("preço", rules).winner?.rule.id).toBe("b");
  });
  it("regra fora do horário é pulada e a próxima que casa e está no horário vence", () => {
    const rules = [
      rule({ id: "comercial", priority: 1, schedule: sched({ mode: "business_hours" }) }),
      rule({ id: "fora", priority: 2, schedule: sched({ mode: "outside_hours" }) }),
    ];
    const noite = { now: at("2026-03-10T21:00:00") };
    expect(ev("preço", rules).winner?.rule.id).toBe("comercial");
    expect(ev("preço", rules, noite).winner?.rule.id).toBe("fora");
    expect(ev("preço", rules, noite).status).toBe("fire");
  });
  it("todas casam mas fora do horário: nada dispara", () => {
    const r = ev("preço", [rule({ schedule: sched({ mode: "business_hours" }) })], { now: at("2026-03-15T12:00:00") });
    expect(r.status).toBe("outside_schedule");
    expect(r.winner).toBeNull();
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].schedule.ok).toBe(false);
  });
  it("campanha fora do período não dispara", () => {
    const r = ev("preço", [rule({ schedule: sched({ startDate: "2026-11-25", endDate: "2026-11-30" }) })]);
    expect(r.status).toBe("outside_schedule");
  });
  it("cooldown ativo barra a regra vencedora", () => {
    const last = new Date(TUE_NOON.getTime() - 30 * 60_000); // 30 min atrás
    const r = ev("preço", [rule({ cooldownMinutes: 60 })], { lastFiredAt: () => last });
    expect(r.status).toBe("cooldown");
    expect(r.winner?.rule.id).toBe("r1");
    expect(r.winner?.cooldown.active).toBe(true);
    expect(r.winner?.cooldown.until?.getTime()).toBe(last.getTime() + 60 * 60_000);
    expect(r.action).toBeNull();
  });
  it("cooldown vencido libera", () => {
    const last = new Date(TUE_NOON.getTime() - 61 * 60_000);
    expect(ev("preço", [rule({ cooldownMinutes: 60 })], { lastFiredAt: () => last }).status).toBe("fire");
  });
  it("cooldown termina exatamente no limite", () => {
    const last = new Date(TUE_NOON.getTime() - 60 * 60_000);
    expect(ev("preço", [rule({ cooldownMinutes: 60 })], { lastFiredAt: () => last }).status).toBe("fire");
  });
  it("cooldown 0 desliga o intervalo", () => {
    const last = new Date(TUE_NOON.getTime() - 1000);
    expect(ev("preço", [rule({ cooldownMinutes: 0 })], { lastFiredAt: () => last }).status).toBe("fire");
  });
  it("cooldown é por regra: outra regra que casa não é liberada (não passa por cima)", () => {
    const last = new Date(TUE_NOON.getTime() - 60_000);
    const rules = [rule({ id: "a", priority: 1 }), rule({ id: "b", priority: 2 })];
    const r = ev("preço", rules, { lastFiredAt: (id) => (id === "a" ? last : null) });
    expect(r.status).toBe("cooldown");
    expect(r.winner?.rule.id).toBe("a");
  });
  it("cooldown de outra regra não afeta a vencedora", () => {
    const last = new Date(TUE_NOON.getTime() - 60_000);
    const r = ev("preço", [rule({ id: "a" })], { lastFiredAt: (id) => (id === "outra" ? last : null) });
    expect(r.status).toBe("fire");
  });
  it("action ai é devolvida para a Fase 5B", () => {
    const r = ev("preço", [rule({ action: "ai" })]);
    expect(r.status).toBe("fire");
    expect(r.action).toBe("ai");
    expect(r.winner?.rule.action).toBe("ai");
  });
  it("modo all na avaliação", () => {
    const rules = [rule({ keywords: ["preço", "iphone"], match: "all" })];
    expect(ev("preço iphone", rules).status).toBe("fire");
    expect(ev("preço galaxy", rules).status).toBe("no_match");
  });
  it("texto vazio não casa nada", () => {
    expect(ev("", [rule()]).status).toBe("no_match");
  });
  it("candidatos trazem o motivo do horário de cada regra", () => {
    const rules = [
      rule({ id: "a", priority: 1, schedule: sched({ mode: "outside_hours" }) }),
      rule({ id: "b", priority: 2 }),
    ];
    const r = ev("preço", rules);
    expect(r.candidates.map((c) => [c.rule.id, c.schedule.ok])).toEqual([["a", false], ["b", true]]);
    expect(r.winner?.rule.id).toBe("b");
  });
});
