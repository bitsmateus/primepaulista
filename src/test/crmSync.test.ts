import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as frontText from "@/lib/crmText";
import * as serverText from "../../server/src/lib/crmText";
import * as frontRules from "@/lib/keywordRules";
import * as serverRules from "../../server/src/lib/keywordRules";

// As cópias do front e do servidor precisam ser IDÊNTICAS (a API é implantada separada do site):
// aqui comparamos o texto dos arquivos E rodamos os mesmos casos nas duas.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("cópias do front e do servidor", () => {
  it("crmText.ts é idêntico nos dois lados", () => {
    expect(read("../lib/crmText.ts")).toBe(read("../../server/src/lib/crmText.ts"));
  });
  it("keywordRules.ts é idêntico nos dois lados", () => {
    expect(read("../lib/keywordRules.ts")).toBe(read("../../server/src/lib/keywordRules.ts"));
  });
});

const both = [
  ["front", frontText],
  ["servidor", serverText],
] as const;

describe.each(both)("crmText (%s)", (_name, t) => {
  it("phoneKey ignora formatação, DDI 55 e completa o 9º dígito antigo", () => {
    expect(t.phoneKey("(11) 98888-7777")).toBe("11988887777");
    expect(t.phoneKey("5511988887777")).toBe("11988887777");
    expect(t.phoneKey("+55 11 98888-7777")).toBe("11988887777");
    expect(t.phoneKey("1188887777")).toBe("11988887777"); // celular antigo sem o 9
    expect(t.phoneKey("551188887777")).toBe("11988887777");
    expect(t.phoneKey("1133334444")).toBe("1133334444"); // fixo não ganha 9
    expect(t.phoneKey("")).toBe("");
    expect(t.phoneKey(null)).toBe("");
    expect(t.phoneKey("abc")).toBe("");
  });
  it("samePhone", () => {
    expect(t.samePhone("(11) 98888-7777", "5511988887777")).toBe(true);
    expect(t.samePhone("11988887777", "1188887777")).toBe(true);
    expect(t.samePhone("11988887777", "11988887778")).toBe(false);
    expect(t.samePhone("", "")).toBe(false);
    expect(t.samePhone("1234567", "1234567")).toBe(false); // curto demais para comparar
    expect(t.samePhone(undefined, "11988887777")).toBe(false);
  });
  it("formatPhoneBR", () => {
    expect(t.formatPhoneBR("5511988887777")).toBe("(11) 98888-7777");
    expect(t.formatPhoneBR("1133334444")).toBe("(11) 3333-4444");
    expect(t.formatPhoneBR("+44 7911 123456")).toBe("447911123456"); // fora do formato BR: só os dígitos
    expect(t.formatPhoneBR("")).toBe("");
  });
  it("foldText compara nomes sem acento", () => {
    expect(t.foldText("Venda Concluída")).toBe("venda concluida");
    expect(t.foldText("  Pós-venda ")).toBe("pos-venda");
    expect(t.foldText("A   B")).toBe("a b");
  });
  it("firstName", () => {
    expect(t.firstName("  Maria  Souza Lima")).toBe("Maria");
    expect(t.firstName("")).toBe("");
  });
});

interface RenderCase {
  name: string;
  template: string;
  ctx: frontText.ReplyContext;
  expected: string;
}
const store = { storeName: "Prime Paulista", address: "Av. Paulista, 2064", pixKey: "pix@loja.com" };
const renderCases: RenderCase[] = [
  {
    name: "todas as variáveis",
    template: "{nome}|{primeiro_nome}|{modelo}|{loja}|{endereco}|{chave_pix}",
    ctx: { name: "Maria Souza", model: "iPhone 15", ...store },
    expected: "Maria Souza|Maria|iPhone 15|Prime Paulista|Av. Paulista, 2064|pix@loja.com",
  },
  {
    name: "sem nome vira cliente",
    template: "Olá, {primeiro_nome}! ({nome})",
    ctx: { name: "", ...store },
    expected: "Olá, cliente! (cliente)",
  },
  {
    name: "nome nulo",
    template: "Oi {primeiro_nome}",
    ctx: { name: null, ...store },
    expected: "Oi cliente",
  },
  {
    name: "modelo vazio em texto de uma linha só: variável some e a pontuação é arrumada",
    template: "Oi {primeiro_nome}, o {modelo} está disponível. {loja}",
    ctx: { name: "Ana", model: "", ...store },
    expected: "Oi Ana, o está disponível. Prime Paulista",
  },
  {
    name: "linha com pix vazio some em texto de várias linhas",
    template: "Pagamento aceito.\n\nPix: {chave_pix}\n\nObrigado, {primeiro_nome}!",
    ctx: { name: "Ana", storeName: "L", address: "A", pixKey: "" },
    expected: "Pagamento aceito.\n\nObrigado, Ana!",
  },
  {
    name: "linha com endereço vazio some",
    template: "Estamos na {endereco}.\nVenha nos visitar na {loja}!",
    ctx: { name: "Ana", storeName: "Prime", address: "  ", pixKey: "" },
    expected: "Venha nos visitar na Prime!",
  },
  {
    name: "variável desconhecida fica como está",
    template: "Oi {primeiro_nome} {inexistente}",
    ctx: { name: "Ana", ...store },
    expected: "Oi Ana {inexistente}",
  },
  {
    name: "repete a mesma variável",
    template: "{loja} - {loja}",
    ctx: { name: "Ana", ...store },
    expected: "Prime Paulista - Prime Paulista",
  },
  {
    name: "não mexe em chaves que não são variável",
    template: "Use {} e { nome } e {123}",
    ctx: { name: "Ana", ...store },
    expected: "Use {} e { nome } e {123}",
  },
  {
    name: "espaços do nome são aparados",
    template: "{nome}|{primeiro_nome}",
    ctx: { name: "   Ana   Lima  ", ...store },
    expected: "Ana   Lima|Ana",
  },
  {
    name: "excesso de linhas em branco é reduzido",
    template: "A\n\n\n\nB",
    ctx: { name: "Ana", ...store },
    expected: "A\n\nB",
  },
];

describe.each(both)("renderReplyTemplate (%s)", (_name, t) => {
  it.each(renderCases)("$name", (c) => {
    expect(t.renderReplyTemplate(c.template, c.ctx)).toBe(c.expected);
  });
  it("modelos padrão só usam variáveis conhecidas", () => {
    const known = new Set(t.REPLY_VARIABLES.map((v) => v.key));
    for (const q of t.DEFAULT_QUICK_REPLIES) {
      for (const m of q.body.matchAll(/\{(\w+)\}/g)) expect(known.has(m[1])).toBe(true);
    }
    expect(t.DEFAULT_QUICK_REPLIES.length).toBeGreaterThanOrEqual(6);
  });
  it("modelos padrão renderizam sem chaves sobrando", () => {
    for (const q of t.DEFAULT_QUICK_REPLIES) {
      const out = t.renderReplyTemplate(q.body, { name: "Maria Souza", model: "iPhone", ...store });
      expect(out).not.toMatch(/\{\w+\}/);
      expect(out.length).toBeGreaterThan(10);
    }
  });
});

// ---- motor de regras: mesmos casos nas duas cópias, comparando o resultado completo ----
const at = (iso: string) => new Date(`${iso}-03:00`);
const baseRule = (over: Partial<frontRules.KeywordRule> = {}): frontRules.KeywordRule => ({
  id: "r", name: "R", category: "Preço", keywords: ["preço"], match: "any", replyBody: "x", action: "reply", priority: 1,
  active: true, schedule: { ...frontRules.DEFAULT_SCHEDULE }, cooldownMinutes: 60, ...over,
});
const engineCases: { text: string; rules: frontRules.KeywordRule[]; now: Date; last?: Record<string, Date> }[] = [
  { text: "Qual o PREÇO?", rules: [baseRule()], now: at("2026-03-10T12:00:00") },
  { text: "quanto custa", rules: [baseRule()], now: at("2026-03-10T12:00:00") },
  { text: "preço", rules: [baseRule({ schedule: { ...frontRules.DEFAULT_SCHEDULE, mode: "business_hours" } })], now: at("2026-03-15T12:00:00") },
  { text: "preço", rules: [baseRule({ id: "a", priority: 2 }), baseRule({ id: "b", priority: 1 })], now: at("2026-03-10T12:00:00") },
  { text: "preço", rules: [baseRule()], now: at("2026-03-10T12:00:00"), last: { r: at("2026-03-10T11:30:00") } },
  { text: "garantia do iphone", rules: [baseRule({ keywords: ["garant*", "iphone"], match: "all" })], now: at("2026-03-10T12:00:00") },
  {
    text: "preço",
    rules: [baseRule({ schedule: { mode: "window", days: [5], from: "22:00", to: "06:00", startDate: "2026-03-01", endDate: "2026-03-31" } })],
    now: at("2026-03-14T03:00:00"),
  },
  { text: "preço", rules: [baseRule({ action: "ai" })], now: at("2026-03-10T12:00:00") },
];

describe("motor de regras: front = servidor", () => {
  it.each(engineCases.map((c, i) => [i, c] as const))("caso %i", (_i, c) => {
    const run = (m: typeof frontRules) =>
      m.evaluateRules({
        text: c.text, rules: c.rules, now: c.now, businessHours: m.DEFAULT_BUSINESS_HOURS,
        lastFiredAt: (id) => c.last?.[id] ?? null,
      });
    expect(JSON.parse(JSON.stringify(run(serverRules)))).toEqual(JSON.parse(JSON.stringify(run(frontRules))));
  });
  it("constantes e utilitários iguais", () => {
    expect(serverRules.RULE_CATEGORIES).toEqual(frontRules.RULE_CATEGORIES);
    expect(serverRules.DEFAULT_BUSINESS_HOURS).toEqual(frontRules.DEFAULT_BUSINESS_HOURS);
    expect(serverRules.zonedParts(at("2026-03-10T23:30:00"))).toEqual(frontRules.zonedParts(at("2026-03-10T23:30:00")));
    expect(serverRules.normalizeText("Ação!")).toBe(frontRules.normalizeText("Ação!"));
  });
});
