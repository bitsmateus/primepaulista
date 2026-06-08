import { describe, it, expect } from "vitest";
import {
  formatPhoneInput, leadMatchesSearch, personalizeMessage,
  buildRecipients, filterRecipients, buildFunnelSummary, leadHasPurchased,
} from "@/lib/crm";
import { Lead, FunnelColumn } from "@/types/crm";
import { Customer, Sale } from "@/types/inventory";

const mkLead = (over: Partial<Lead>): Lead => ({
  id: "l1", name: "João Silva", phone: "", modelInterest: "", origin: "Instagram",
  status: "Novo", notes: "", createdAt: new Date(), ...over,
});
const mkCustomer = (over: Partial<Customer>): Customer => ({
  id: "c1", name: "Maria Souza", cpf: "", whatsapp: "", birthday: "",
  leadOrigin: "Indicação", createdAt: new Date(), ...over,
});

describe("máscara de telefone", () => {
  it("formata progressivamente", () => {
    expect(formatPhoneInput("11")).toBe("(11");
    expect(formatPhoneInput("1199999")).toBe("(11) 99999");
    expect(formatPhoneInput("11999998888")).toBe("(11) 99999-8888");
  });
  it("ignora não dígitos e limita a 11", () => {
    expect(formatPhoneInput("(11) 99999-8888999")).toBe("(11) 99999-8888");
  });
});

describe("busca de lead", () => {
  const l = mkLead({ name: "Maria Souza", phone: "(11) 98888-7777", modelInterest: "iPhone 15" });
  it("acha por nome", () => expect(leadMatchesSearch(l, "maria")).toBe(true));
  it("acha por modelo", () => expect(leadMatchesSearch(l, "iphone")).toBe(true));
  it("acha por telefone ignorando formatação", () => expect(leadMatchesSearch(l, "988887777")).toBe(true));
  it("query vazia retorna true", () => expect(leadMatchesSearch(l, "")).toBe(true));
  it("não acha o ausente", () => expect(leadMatchesSearch(l, "pedro")).toBe(false));
});

describe("personalização {nome}", () => {
  it("usa o primeiro nome", () => {
    expect(personalizeMessage("Olá {nome}!", "João Silva")).toBe("Olá João!");
  });
  it("substitui todas as ocorrências", () => {
    expect(personalizeMessage("{nome}, {nome}", "Ana Lima")).toBe("Ana, Ana");
  });
  it("nome vazio não quebra", () => {
    expect(personalizeMessage("Oi {nome}", "")).toBe("Oi ");
  });
});

describe("destinatários (dedup por telefone)", () => {
  it("combina leads e clientes", () => {
    const r = buildRecipients(
      [mkLead({ id: "l1", phone: "11999990000" })],
      [mkCustomer({ id: "c1", whatsapp: "11988887777" })]
    );
    expect(r).toHaveLength(2);
  });
  it("deduplica mesmo telefone, lead tem prioridade", () => {
    const r = buildRecipients(
      [mkLead({ id: "l1", name: "Lead João", phone: "(11) 99999-0000", modelInterest: "iPhone 15" })],
      [mkCustomer({ id: "c1", name: "Cliente João", whatsapp: "11999990000" })]
    );
    expect(r).toHaveLength(1);
    expect(r[0].source).toBe("lead");
    expect(r[0].model).toBe("iPhone 15");
  });
  it("não deduplica telefones vazios", () => {
    const r = buildRecipients([], [mkCustomer({ id: "c1", whatsapp: "" }), mkCustomer({ id: "c2", whatsapp: "" })]);
    expect(r).toHaveLength(2);
  });
});

describe("filtro de destinatários", () => {
  const recipients = buildRecipients(
    [mkLead({ id: "l1", phone: "1", modelInterest: "iPhone 15", origin: "Instagram" })],
    [mkCustomer({ id: "c1", whatsapp: "2", leadOrigin: "Indicação" })]
  );
  it("filtro de modelo não esconde cliente sem modelo quando 'all'", () => {
    expect(filterRecipients(recipients, { model: "all" })).toHaveLength(2);
  });
  it("filtro de modelo aplica só a quem tem modelo", () => {
    const f = filterRecipients(recipients, { model: "iPhone 15" });
    expect(f).toHaveLength(1);
    expect(f[0].source).toBe("lead");
  });
  it("filtro de origem", () => {
    const f = filterRecipients(recipients, { origin: "Indicação" });
    expect(f).toHaveLength(1);
    expect(f[0].source).toBe("customer");
  });
});

describe("resumo do funil", () => {
  const columns: FunnelColumn[] = [
    { id: "1", name: "Novo", color: "x" },
    { id: "2", name: "Convertido", color: "y" },
  ];
  const leads = [
    mkLead({ id: "a", status: "Novo" }),
    mkLead({ id: "b", status: "Convertido" }),
    mkLead({ id: "c", status: "Convertido" }),
  ];
  it("conta por coluna e calcula conversão", () => {
    const s = buildFunnelSummary(leads, columns);
    expect(s.total).toBe(3);
    expect(s.byColumn.find((c) => c.name === "Convertido")?.count).toBe(2);
    expect(s.converted).toBe(2);
    expect(s.conversionRate).toBeCloseTo(2 / 3);
  });
  it("funil vazio não divide por zero", () => {
    expect(buildFunnelSummary([], columns).conversionRate).toBe(0);
  });
});

describe("lead que comprou", () => {
  const sale = (whatsapp: string): Sale => ({
    id: "s1", customer: mkCustomer({ whatsapp }), items: [], payments: [],
    seller: "Gabriel" as Sale["seller"], subtotal: 0, tradeInDiscount: 0,
    discount: 0, total: 0, createdAt: new Date(),
  });
  it("detecta por telefone igual", () => {
    expect(leadHasPurchased(mkLead({ phone: "(11) 99999-0000" }), [sale("11999990000")])).toBe(true);
  });
  it("não marca quando não há venda correspondente", () => {
    expect(leadHasPurchased(mkLead({ phone: "11999990000" }), [sale("11000000000")])).toBe(false);
  });
  it("telefone vazio nunca é comprador", () => {
    expect(leadHasPurchased(mkLead({ phone: "" }), [sale("")])).toBe(false);
  });
});
