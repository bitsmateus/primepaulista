import { describe, it, expect } from "vitest";
import * as front from "@/lib/osMessages";
// Cópia usada pelo servidor: as duas precisam dar exatamente o mesmo resultado
import * as server from "../../server/src/services/osMessages";

const settings = (over: Partial<front.OsMessagesSettings> = {}): front.OsMessagesSettings => ({
  ...front.DEFAULT_OS_MESSAGES,
  storeName: "Prime Paulista",
  ...over,
});

const os = (over: Partial<front.OsForMessage> = {}): front.OsForMessage => ({
  id: "abcdef12-3456-4789-8abc-def012345678",
  customerName: "Maria Souza Lima",
  model: "iPhone 14 Pro",
  color: "Preto",
  serialImei: "356789012345678",
  serial: "F2LXYZ",
  chargedAmount: 1234.5,
  costResponsibility: "Cliente",
  ...over,
});

interface Case {
  name: string;
  template: string;
  os: front.OsForMessage;
  settings: front.OsMessagesSettings;
  expected: string;
}

const cases: Case[] = [
  {
    name: "todas as variáveis",
    template: "{cliente}|{primeiro_nome}|{os}|{aparelho}|{marca}|{modelo}|{imei}|{valor}|{loja}",
    os: os(),
    settings: settings(),
    expected: "Maria Souza Lima|Maria|ABCDEF12|iPhone 14 Pro Preto|Apple|iPhone 14 Pro|356789012345678|R$ 1.234,50|Prime Paulista",
  },
  {
    name: "variável desconhecida fica como está",
    template: "Oi {primeiro_nome} {inexistente}",
    os: os(),
    settings: settings(),
    expected: "Oi Maria {inexistente}",
  },
  {
    name: "imei cai para o serial quando não há IMEI",
    template: "{imei}",
    os: os({ serialImei: "" }),
    settings: settings(),
    expected: "F2LXYZ",
  },
  {
    name: "marca Samsung e sem cor",
    template: "{aparelho} / {marca}",
    os: os({ model: "Galaxy S24", color: "" }),
    settings: settings(),
    expected: "Galaxy S24 / Samsung",
  },
  {
    name: "marca desconhecida vira vazio",
    template: "[{marca}]",
    os: os({ model: "Aparelho X" }),
    settings: settings(),
    expected: "[]",
  },
  {
    name: "garantia: valor isento coberto pela garantia",
    template: "Valor: {valor}",
    os: os({ costResponsibility: "Garantia da Loja", chargedAmount: 0 }),
    settings: settings(),
    expected: "Valor: R$ 0,00 (isento – coberto pela garantia da loja)",
  },
  {
    name: "garantia ignora o valor digitado",
    template: "Valor: {valor}",
    os: os({ costResponsibility: "Garantia da Loja", chargedAmount: 999 }),
    settings: settings(),
    expected: "Valor: R$ 0,00 (isento – coberto pela garantia da loja)",
  },
  {
    name: "cortesia",
    template: "{valor}",
    os: os({ costResponsibility: "Cortesia / Loja", chargedAmount: 0 }),
    settings: settings(),
    expected: "R$ 0,00 (isento – cortesia da loja)",
  },
  {
    name: "dividido mostra a parte do cliente",
    template: "{valor}",
    os: os({ costResponsibility: "Dividido / Co-participação", chargedAmount: 150 }),
    settings: settings(),
    expected: "R$ 150,00 (sua parte; custo dividido com a loja)",
  },
  {
    name: "chave PIX ligada aparece",
    template: "Pague no PIX: {chave_pix}",
    os: os(),
    settings: settings({ includePixKey: true, pixKey: " pix@loja.com " }),
    expected: "Pague no PIX: pix@loja.com",
  },
  {
    name: "chave PIX desligada: a linha some",
    template: "Olá {primeiro_nome}\n\nPagamento via PIX: {chave_pix}\n\nObrigado",
    os: os(),
    settings: settings({ includePixKey: false, pixKey: "pix@loja.com" }),
    expected: "Olá Maria\n\nObrigado",
  },
  {
    name: "chave PIX ligada mas vazia: a linha some",
    template: "A\nPIX: {chave_pix}\nB",
    os: os(),
    settings: settings({ includePixKey: true, pixKey: "   " }),
    expected: "A\nB",
  },
  {
    name: "OS isenta não mostra PIX mesmo ligado",
    template: "A\nPIX: {chave_pix}\nB",
    os: os({ costResponsibility: "Cortesia / Loja", chargedAmount: 0 }),
    settings: settings({ includePixKey: true, pixKey: "pix@loja.com" }),
    expected: "A\nB",
  },
  {
    name: "valor zero (cliente) também não mostra PIX",
    template: "A\nPIX: {chave_pix}",
    os: os({ chargedAmount: 0 }),
    settings: settings({ includePixKey: true, pixKey: "pix@loja.com" }),
    expected: "A",
  },
  {
    name: "variável repetida é trocada em todas as ocorrências",
    template: "{primeiro_nome}, {primeiro_nome}!",
    os: os(),
    settings: settings(),
    expected: "Maria, Maria!",
  },
  {
    name: "nome com espaços sobrando",
    template: "Oi {primeiro_nome}",
    os: os({ customerName: "  João   Pedro " }),
    settings: settings(),
    expected: "Oi João",
  },
  {
    name: "modelo padrão de pronto para retirada (sem PIX)",
    template: front.DEFAULT_OS_MESSAGES.templates.pronto_retirada,
    os: os({ chargedAmount: 300 }),
    settings: settings(),
    expected:
      "Olá, Maria! Seu iPhone 14 Pro Preto (OS ABCDEF12) está pronto para retirada na Prime Paulista. Valor: R$ 300,00.\n\nAtendemos de segunda a sábado, das 9h às 18h.",
  },
  {
    name: "modelo padrão de pronto para retirada (com PIX)",
    template: front.DEFAULT_OS_MESSAGES.templates.pronto_retirada,
    os: os({ chargedAmount: 300 }),
    settings: settings({ includePixKey: true, pixKey: "11999990000" }),
    expected:
      "Olá, Maria! Seu iPhone 14 Pro Preto (OS ABCDEF12) está pronto para retirada na Prime Paulista. Valor: R$ 300,00.\n\nPagamento via PIX: 11999990000\n\nAtendemos de segunda a sábado, das 9h às 18h.",
  },
  {
    name: "sem HTML/execução: texto entra literal",
    template: "{cliente}",
    os: os({ customerName: "<b>x</b>" }),
    settings: settings(),
    expected: "<b>x</b>",
  },
];

describe("renderOsMessage (front)", () => {
  for (const c of cases) {
    it(c.name, () => expect(front.renderOsMessage(c.template, c.os, c.settings)).toBe(c.expected));
  }
});

describe("renderOsMessage (servidor) = mesmos casos", () => {
  for (const c of cases) {
    it(c.name, () => expect(server.renderOsMessage(c.template, c.os, c.settings)).toBe(c.expected));
  }
});

describe("cópias front e servidor não divergem", () => {
  it("mesmos padrões, variáveis e rótulos", () => {
    expect(server.DEFAULT_OS_MESSAGES).toEqual(front.DEFAULT_OS_MESSAGES);
    expect(server.OS_VARIABLES).toEqual(front.OS_VARIABLES);
    expect(server.OS_EVENT_LABELS).toEqual(front.OS_EVENT_LABELS);
    expect(server.COST_RESPONSIBILITIES).toEqual(front.COST_RESPONSIBILITIES);
  });
  it("todos os modelos padrão só usam variáveis conhecidas", () => {
    const known = new Set(front.OS_VARIABLES.map((v) => v.key));
    for (const t of Object.values(front.DEFAULT_OS_MESSAGES.templates)) {
      for (const m of t.matchAll(/\{(\w+)\}/g)) expect(known.has(m[1])).toBe(true);
    }
  });
  it("formatBRL", () => {
    expect(front.formatBRL(0)).toBe("R$ 0,00");
    expect(front.formatBRL(1234567.891)).toBe("R$ 1.234.567,89");
    expect(server.formatBRL(1234567.891)).toBe("R$ 1.234.567,89");
    expect(front.formatBRL(NaN)).toBe("R$ 0,00");
  });
});

// Fase 4A: nome e PIX próprios vazios usam os da loja (Configurações > Loja) — nas duas cópias
describe("withStoreFallback (front = servidor)", () => {
  const store = { name: "Loja Nova", pixKey: "pix@loja.com" };
  for (const [nome, mod] of [["front", front], ["servidor", server]] as const) {
    it(`${nome}: campos próprios vazios usam os da loja`, () => {
      const s = mod.withStoreFallback({ ...mod.DEFAULT_OS_MESSAGES, storeName: "  ", pixKey: "" }, store);
      expect(s.storeName).toBe("Loja Nova");
      expect(s.pixKey).toBe("pix@loja.com");
    });
    it(`${nome}: campos próprios preenchidos têm prioridade`, () => {
      const s = mod.withStoreFallback({ ...mod.DEFAULT_OS_MESSAGES, storeName: "Assistência X", pixKey: "meu@pix" }, store);
      expect(s.storeName).toBe("Assistência X");
      expect(s.pixKey).toBe("meu@pix");
    });
    it(`${nome}: padrão do nome é vazio (usa a loja) e a mensagem sai com o nome da loja`, () => {
      expect(mod.DEFAULT_OS_MESSAGES.storeName).toBe("");
      const s = mod.withStoreFallback({ ...mod.DEFAULT_OS_MESSAGES, includePixKey: true }, store);
      const msg = mod.renderOsMessage("Olá! {loja} — PIX: {chave_pix}", os(), s);
      expect(msg).toBe("Olá! Loja Nova — PIX: pix@loja.com");
    });
  }
});
