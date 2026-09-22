import { describe, it, expect } from "vitest";
import {
  DEFAULT_AGENDA_CONFIG, addDaysYmd, brDate, buildAgenda, diffDays, dueIso, filterByOwner, groupAgenda, groupOf,
  nextBirthday, rescheduleDate, spDate, weekOf, type AgendaInput,
} from "@/lib/agenda";
import type { Customer, Sale, CartItem } from "@/types/inventory";
import type { Lead, LeadTask } from "@/types/crm";
import type { Quote } from "@/types/quote";

// São Paulo = UTC-3. "Hoje" nos testes: terça-feira 10/03/2026, meio-dia em São Paulo.
const at = (iso: string) => new Date(`${iso}-03:00`);
const NOW = at("2026-03-10T12:00:00");
const TODAY = "2026-03-10";

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: "c1", name: "Maria Souza", cpf: "", whatsapp: "(11) 98888-7777", birthday: "", leadOrigin: "Instagram", createdAt: at("2025-01-01T10:00:00"), ...over,
});
const item = (over: Partial<CartItem> = {}): CartItem => ({ id: "i1", type: "device", name: "iPhone 12 128GB", price: 2800, quantity: 1, warrantyDays: 0, ...over });
const sale = (over: Partial<Sale> & { day?: string } = {}): Sale => {
  const { day, ...rest } = over;
  return {
    id: "s1", customer: customer(), items: [item()], payments: [], seller: "Gabriel", subtotal: 2800, tradeInDiscount: 0, discount: 0,
    total: 2800, giftsCost: 0, requiresInvoice: false, createdAt: at(`${day ?? "2026-02-01"}T15:00:00`), ...rest,
  } as Sale;
};
const quote = (over: Partial<Quote> = {}): Quote => ({
  id: "q1", number: 7, customerName: "João Lima", customerPhone: "(11) 97777-6666", sellerName: "Tassio", status: "Enviado",
  subtotal: 5000, discount: 0, total: 5000, paymentTerms: "", notes: "", createdAt: at("2026-03-01T10:00:00"),
  updatedAt: at("2026-03-05T10:00:00"), items: [], ...over,
});
const task = (over: Partial<LeadTask> = {}): LeadTask => ({ id: "t1", leadId: "l1", title: "Ligar", dueDate: at("2026-03-10T12:00:00"), done: false, createdAt: at("2026-03-01T10:00:00"), ...over });
const lead = (over: Partial<Lead> = {}): Lead => ({
  id: "l1", name: "Ana Lead", phone: "(11) 96666-5555", modelInterest: "", origin: "WhatsApp", status: "Novo Lead", notes: "",
  ownerId: "u1", ownerName: "Gabriel", createdAt: at("2026-03-01T10:00:00"), ...over,
});

const input = (over: Partial<AgendaInput> = {}): AgendaInput => ({
  now: NOW, config: DEFAULT_AGENDA_CONFIG, tasks: [], leads: [], customers: [], sales: [], quotes: [], messageLogs: [], storeName: "Prime Paulista", ...over,
});
const kinds = (its: ReturnType<typeof buildAgenda>) => its.map((i) => i.kind);

describe("datas em São Paulo", () => {
  it("spDate usa o dia de São Paulo, não o UTC", () => {
    expect(spDate(new Date("2026-03-11T02:30:00Z"))).toBe("2026-03-10"); // 23:30 em SP
    expect(spDate(new Date("2026-03-10T03:00:00Z"))).toBe("2026-03-10"); // 00:00 em SP
    expect(spDate(new Date("2026-03-10T02:59:00Z"))).toBe("2026-03-09");
  });
  it("addDaysYmd e diffDays atravessam mês e ano", () => {
    expect(addDaysYmd("2026-03-10", 7)).toBe("2026-03-17");
    expect(addDaysYmd("2026-03-31", 1)).toBe("2026-04-01");
    expect(addDaysYmd("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysYmd("2028-03-01", -1)).toBe("2028-02-29");
    expect(diffDays("2026-03-10", "2026-03-10")).toBe(0);
    expect(diffDays("2026-03-10", "2026-04-09")).toBe(30);
    expect(diffDays("2026-03-10", "2026-03-09")).toBe(-1);
  });
  it("brDate e dueIso", () => {
    expect(brDate("2026-03-05")).toBe("05/03/2026");
    expect(dueIso("2026-03-05")).toBe("2026-03-05T12:00:00-03:00");
    expect(spDate(new Date(dueIso("2026-03-05")))).toBe("2026-03-05");
  });
  it("rescheduleDate: hoje, amanhã, +7 dias", () => {
    expect(rescheduleDate("today", NOW)).toBe("2026-03-10");
    expect(rescheduleDate("tomorrow", NOW)).toBe("2026-03-11");
    expect(rescheduleDate("week", NOW)).toBe("2026-03-17");
    // 23:30 em SP ainda é dia 10
    expect(rescheduleDate("tomorrow", new Date("2026-03-11T02:30:00Z"))).toBe("2026-03-11");
  });
});

describe("próximo aniversário", () => {
  it("hoje conta", () => expect(nextBirthday("1990-03-10", "2026-03-10")).toBe("2026-03-10"));
  it("mais tarde no ano", () => expect(nextBirthday("1990-03-15", "2026-03-10")).toBe("2026-03-15"));
  it("já passou este ano: vira o ano que vem", () => expect(nextBirthday("1990-03-09", "2026-03-10")).toBe("2027-03-09"));
  it("virada de ano", () => expect(nextBirthday("1990-01-02", "2026-12-30")).toBe("2027-01-02"));
  it("29/02 em ano comum cai em 28/02", () => {
    expect(nextBirthday("2000-02-29", "2026-02-20")).toBe("2026-02-28");
    expect(nextBirthday("2000-02-29", "2028-02-20")).toBe("2028-02-29");
  });
  it("formato dd/mm/aaaa também vale", () => expect(nextBirthday("15/03/1990", "2026-03-10")).toBe("2026-03-15"));
  it("vazio e lixo", () => {
    expect(nextBirthday("", "2026-03-10")).toBeNull();
    expect(nextBirthday("abc", "2026-03-10")).toBeNull();
    expect(nextBirthday("1990-13-40", "2026-03-10")).toBeNull();
  });
});

describe("tarefas de leads", () => {
  it("vira item com data em São Paulo e dono do lead", () => {
    const [it] = buildAgenda(input({ tasks: [task()], leads: [lead()] }));
    expect(it).toMatchObject({ kind: "task", key: "task:t1", title: "Ligar", date: TODAY, done: false, ownerName: "Gabriel", leadId: "l1", taskId: "t1", phone: "(11) 96666-5555" });
    expect(it.detail).toBe("Lead: Ana Lead");
  });
  it("sem data fica sem data", () => {
    const [it] = buildAgenda(input({ tasks: [task({ dueDate: null })], leads: [lead()] }));
    expect(it.date).toBeNull();
  });
  it("tarefa de meia-noite UTC cai no dia certo de SP", () => {
    const [it] = buildAgenda(input({ tasks: [task({ dueDate: new Date("2026-03-11T01:00:00Z") })], leads: [lead()] }));
    expect(it.date).toBe("2026-03-10");
  });
});

describe("agrupamento", () => {
  const mk = (id: string, date: string | null, done = false) =>
    buildAgenda(input({ tasks: [task({ id, dueDate: date ? at(`${date}T12:00:00`) : null, done })], leads: [lead()] }))[0];
  it("groupOf: atrasados, hoje, próximos 7 dias, depois, sem data", () => {
    expect(groupOf({ date: "2026-03-09" }, TODAY)).toBe("overdue");
    expect(groupOf({ date: "2026-03-10" }, TODAY)).toBe("today");
    expect(groupOf({ date: "2026-03-11" }, TODAY)).toBe("next7");
    expect(groupOf({ date: "2026-03-17" }, TODAY)).toBe("next7"); // +7 ainda entra
    expect(groupOf({ date: "2026-03-18" }, TODAY)).toBe("later");
    expect(groupOf({ date: null }, TODAY)).toBe("nodate");
  });
  it("groupAgenda separa e ordena por data; concluídas ficam de fora por padrão", () => {
    const items = [mk("a", "2026-03-12"), mk("b", "2026-03-01"), mk("c", "2026-03-10"), mk("d", null), mk("e", "2026-03-09", true), mk("f", "2026-04-20"), mk("g", "2026-03-11")];
    const g = groupAgenda(items, NOW);
    expect(g.overdue.map((i) => i.taskId)).toEqual(["b"]); // "e" concluída sai
    expect(g.today.map((i) => i.taskId)).toEqual(["c"]);
    expect(g.next7.map((i) => i.taskId)).toEqual(["g", "a"]);
    expect(g.later.map((i) => i.taskId)).toEqual(["f"]);
    expect(g.nodate.map((i) => i.taskId)).toEqual(["d"]);
    expect(groupAgenda(items, NOW, true).overdue.map((i) => i.taskId)).toEqual(["b", "e"]);
  });
  it("concluir tira do grupo; reagendar muda de grupo", () => {
    expect(groupAgenda([mk("a", "2026-03-01")], NOW).overdue).toHaveLength(1);
    expect(groupAgenda([mk("a", "2026-03-01", true)], NOW).overdue).toHaveLength(0);
    expect(groupAgenda([mk("a", "2026-03-10")], NOW).overdue).toHaveLength(0);
  });
});

describe("sugestão: aniversariantes da semana", () => {
  it("hoje até +6 dias", () => {
    const cs = [
      customer({ id: "hoje", name: "Hoje", birthday: "1990-03-10" }),
      customer({ id: "d6", name: "Seis", birthday: "1990-03-16" }),
      customer({ id: "d7", name: "Sete", birthday: "1990-03-17" }),
      customer({ id: "ontem", name: "Ontem", birthday: "1990-03-09" }),
      customer({ id: "sem", name: "Sem", birthday: "" }),
    ];
    const its = buildAgenda(input({ customers: cs })).filter((i) => i.kind === "birthday");
    expect(its.map((i) => i.customerId).sort()).toEqual(["d6", "hoje"]);
    const hoje = its.find((i) => i.customerId === "hoje")!;
    expect(hoje.date).toBe(TODAY);
    expect(hoje.detail).toBe("Faz aniversário hoje");
    expect(hoje.message).toContain("Feliz aniversário");
    expect(hoje.message).toContain("Prime Paulista");
    expect(its.find((i) => i.customerId === "d6")!.date).toBe("2026-03-16");
  });
  it("virada de ano: 30/12 vê aniversário de 02/01", () => {
    const its = buildAgenda(input({ now: at("2026-12-30T12:00:00"), customers: [customer({ birthday: "1990-01-02" })] }));
    expect(its[0]).toMatchObject({ kind: "birthday", date: "2027-01-02", key: "birthday:c1:2027" });
  });
  it("não repete se já virou tarefa", () => {
    const t = task({ sourceKey: "birthday:c1:2026", leadId: "l1" });
    const its = buildAgenda(input({ customers: [customer({ birthday: "1990-03-12" })], tasks: [t], leads: [lead()] }));
    expect(its.filter((i) => i.kind === "birthday")).toHaveLength(0);
  });
});

describe("sugestão: cliente com compra há N dias e sem contato", () => {
  it("30 dias ou mais (limite inclusive)", () => {
    // 10/03 - 30 dias = 08/02
    const s30 = sale({ id: "s30", day: "2026-02-08" });
    const s29 = sale({ id: "s29", day: "2026-02-09", customer: customer({ id: "c2", name: "Outra" }) });
    const its = buildAgenda(input({ sales: [s30, s29] })).filter((i) => i.kind === "purchase");
    expect(its.map((i) => i.customerId)).toEqual(["c1"]);
    expect(its[0].detail).toContain("30 dias");
    expect(its[0].date).toBe(TODAY);
    expect(its[0].message).toContain("iPhone 12 128GB");
  });
  it("mais antigas que o máximo não entram", () => {
    const velha = sale({ day: "2025-03-09" }); // 366 dias
    const ok = sale({ id: "s2", day: "2025-03-10", customer: customer({ id: "c2" }) }); // 365
    const its = buildAgenda(input({ sales: [velha, ok] })).filter((i) => i.kind === "purchase");
    expect(its.map((i) => i.customerId)).toEqual(["c2"]);
  });
  it("só a última compra do cliente conta", () => {
    const antiga = sale({ id: "a", day: "2026-01-01" });
    const nova = sale({ id: "b", day: "2026-03-05" }); // 5 dias: ainda não
    expect(buildAgenda(input({ sales: [antiga, nova] })).filter((i) => i.kind === "purchase")).toHaveLength(0);
  });
  it("venda devolvida não conta", () => {
    expect(buildAgenda(input({ sales: [sale({ returnedAt: at("2026-02-10T10:00:00") })] })).filter((i) => i.kind === "purchase")).toHaveLength(0);
  });
  it("contato depois da compra (mensagem enviada ou recebida) tira a sugestão", () => {
    const logs = [{ recipientId: "x", recipientPhone: "5511988887777", sentAt: at("2026-02-20T10:00:00") }];
    expect(buildAgenda(input({ sales: [sale()], messageLogs: logs })).filter((i) => i.kind === "purchase")).toHaveLength(0);
  });
  it("contato ANTES da compra não conta", () => {
    const logs = [{ recipientId: "x", recipientPhone: "(11) 98888-7777", sentAt: at("2026-01-20T10:00:00") }];
    expect(buildAgenda(input({ sales: [sale()], messageLogs: logs })).filter((i) => i.kind === "purchase")).toHaveLength(1);
  });
  it("contato de OUTRO telefone não conta", () => {
    const logs = [{ recipientId: "x", recipientPhone: "11999990000", sentAt: at("2026-02-20T10:00:00") }];
    expect(buildAgenda(input({ sales: [sale()], messageLogs: logs })).filter((i) => i.kind === "purchase")).toHaveLength(1);
  });
  it("já virou tarefa (mesmo concluída): some", () => {
    const t = task({ sourceKey: "purchase:c1:s1", done: true });
    expect(buildAgenda(input({ sales: [sale()], tasks: [t], leads: [lead()] })).filter((i) => i.kind === "purchase")).toHaveLength(0);
  });
  it("N configurável", () => {
    const s = sale({ day: "2026-03-01" }); // 9 dias
    expect(buildAgenda(input({ sales: [s] })).filter((i) => i.kind === "purchase")).toHaveLength(0);
    expect(buildAgenda(input({ sales: [s], config: { ...DEFAULT_AGENDA_CONFIG, purchaseDays: 9 } })).filter((i) => i.kind === "purchase")).toHaveLength(1);
  });
  it("dono vem do lead com o mesmo telefone, senão do vendedor da venda", () => {
    const l = lead({ phone: "5511988887777", ownerId: "u9", ownerName: "Matheus" });
    expect(buildAgenda(input({ sales: [sale()], leads: [l] })).find((i) => i.kind === "purchase")!.ownerName).toBe("Matheus");
    expect(buildAgenda(input({ sales: [sale()] })).find((i) => i.kind === "purchase")!.ownerName).toBe("Gabriel");
  });
  it("venda sem cliente cadastrado é ignorada", () => {
    expect(buildAgenda(input({ sales: [sale({ customer: customer({ id: "" }) })] })).filter((i) => i.kind === "purchase")).toHaveLength(0);
  });
});

describe("sugestão: orçamento enviado sem resposta", () => {
  it("3 dias ou mais (limite inclusive) e só status Enviado", () => {
    // updatedAt 05/03 => 5 dias
    const its = buildAgenda(input({ quotes: [quote(), quote({ id: "q2", updatedAt: at("2026-03-07T10:00:00") }), quote({ id: "q3", updatedAt: at("2026-03-08T10:00:00") })] }));
    expect(its.filter((i) => i.kind === "quote").map((i) => i.key).sort()).toEqual(["quote:q1", "quote:q2"]); // 5 e 3 dias; 2 dias não
  });
  it("outros status não geram sugestão", () => {
    for (const status of ["Aberto", "Aprovado", "Recusado", "Convertido"] as const) {
      expect(buildAgenda(input({ quotes: [quote({ status })] })).filter((i) => i.kind === "quote")).toHaveLength(0);
    }
  });
  it("texto do item", () => {
    const it = buildAgenda(input({ quotes: [quote()] })).find((i) => i.kind === "quote")!;
    expect(it.title).toBe("Orçamento nº 7 sem resposta: João Lima");
    expect(it.detail).toContain("5 dias");
    expect(it.stage).toBe("Orçamento Enviado");
    expect(it.ownerName).toBe("Tassio");
    expect(it.message).toContain("orçamento nº 7");
  });
  it("resposta do cliente depois do envio tira a sugestão", () => {
    const logs = [{ recipientId: "l", recipientPhone: "5511977776666", sentAt: at("2026-03-06T10:00:00") }];
    expect(buildAgenda(input({ quotes: [quote()], messageLogs: logs })).filter((i) => i.kind === "quote")).toHaveLength(0);
  });
  it("já virou tarefa: some", () => {
    expect(buildAgenda(input({ quotes: [quote()], tasks: [task({ sourceKey: "quote:q1" })], leads: [lead()] })).filter((i) => i.kind === "quote")).toHaveLength(0);
  });
  it("N configurável", () => {
    expect(buildAgenda(input({ quotes: [quote({ updatedAt: at("2026-03-09T10:00:00") })] })).filter((i) => i.kind === "quote")).toHaveLength(0);
    expect(buildAgenda(input({ quotes: [quote({ updatedAt: at("2026-03-09T10:00:00") })], config: { ...DEFAULT_AGENDA_CONFIG, quoteDays: 1 } })).filter((i) => i.kind === "quote")).toHaveLength(1);
  });
});

describe("sugestão: garantia vencendo", () => {
  // venda em 10/09/2025 com 180 dias => vence 09/03/2026 (ontem). Vamos montar pelo vencimento desejado.
  const vendaComVencimento = (venc: string, days = 180, id = "s1") => sale({ id, day: addDaysYmd(venc, -days), items: [item({ id: "it" + id, warrantyDays: days })] });
  it("vence nos próximos N dias (hoje até +15, inclusive)", () => {
    const its = buildAgenda(input({
      sales: [
        vendaComVencimento("2026-03-09", 180, "ontem"),
        vendaComVencimento("2026-03-10", 180, "hoje"),
        vendaComVencimento("2026-03-25", 180, "d15"),
        vendaComVencimento("2026-03-26", 180, "d16"),
      ].map((s, i) => ({ ...s, customer: customer({ id: "c" + i }) })),
    })).filter((i) => i.kind === "warranty");
    expect(its.map((i) => i.key).sort()).toEqual(["warranty:d15:itd15", "warranty:hoje:ithoje"]);
    const hoje = its.find((i) => i.key.includes("hoje"))!;
    expect(hoje.date).toBe(TODAY);
    expect(hoje.detail).toContain("hoje");
    expect(its.find((i) => i.key.includes("d15"))!.date).toBe("2026-03-25");
  });
  it("item sem garantia e venda devolvida não entram", () => {
    const sem = sale({ items: [item({ warrantyDays: 0 })] });
    const dev = { ...vendaComVencimento("2026-03-15"), returnedAt: at("2026-03-01T10:00:00") };
    expect(buildAgenda(input({ sales: [sem, dev] })).filter((i) => i.kind === "warranty")).toHaveLength(0);
  });
  it("N configurável", () => {
    const s = vendaComVencimento("2026-03-25");
    expect(buildAgenda(input({ sales: [s], config: { ...DEFAULT_AGENDA_CONFIG, warrantyDays: 10 } })).filter((i) => i.kind === "warranty")).toHaveLength(0);
  });
  it("um item por produto da venda", () => {
    const s = sale({ day: "2025-09-15", items: [item({ id: "a", warrantyDays: 180 }), item({ id: "b", type: "accessory", name: "Capa", warrantyDays: 180 })] });
    // 15/09/2025 + 180 = 14/03/2026 (dentro dos 15 dias)
    expect(buildAgenda(input({ sales: [s] })).filter((i) => i.kind === "warranty")).toHaveLength(2);
  });
});

describe("filtro por responsável", () => {
  const items = buildAgenda(input({
    tasks: [task({ id: "1", leadId: "l1" }), task({ id: "2", leadId: "l2" }), task({ id: "3", leadId: "l3" })],
    leads: [lead({ id: "l1", ownerId: "u1", ownerName: "Gabriel" }), lead({ id: "l2", ownerId: "u2", ownerName: "Matheus" }), lead({ id: "l3", ownerId: undefined, ownerName: "" })],
  }));
  it("todos", () => expect(filterByOwner(items, "all", { id: "u1", name: "Gabriel" })).toHaveLength(3));
  it("minhas: por id ou por nome", () => {
    expect(filterByOwner(items, "mine", { id: "u1", name: "Outro" }).map((i) => i.taskId)).toEqual(["1"]);
    expect(filterByOwner(items, "mine", { id: "zzz", name: "Matheus" }).map((i) => i.taskId)).toEqual(["2"]);
    expect(filterByOwner(items, "mine", {})).toHaveLength(0);
  });
  it("por nome do responsável", () => {
    expect(filterByOwner(items, "Matheus", {}).map((i) => i.taskId)).toEqual(["2"]);
    expect(filterByOwner(items, "Ninguém", {})).toHaveLength(0);
  });
});

describe("visão por semana", () => {
  it("7 dias a partir da segunda com os itens de cada dia", () => {
    const its = buildAgenda(input({
      tasks: [task({ id: "seg", dueDate: at("2026-03-09T12:00:00") }), task({ id: "ter", dueDate: at("2026-03-10T12:00:00") }), task({ id: "dom", dueDate: at("2026-03-15T12:00:00") }), task({ id: "fora", dueDate: at("2026-03-16T12:00:00") })],
      leads: [lead()],
    }));
    const w = weekOf(its, "2026-03-09");
    expect(w.map((d) => d.date)).toEqual(["2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14", "2026-03-15"]);
    expect(w[0].items.map((i) => i.taskId)).toEqual(["seg"]);
    expect(w[1].items.map((i) => i.taskId)).toEqual(["ter"]);
    expect(w[6].items.map((i) => i.taskId)).toEqual(["dom"]);
    expect(w.flatMap((d) => d.items).map((i) => i.taskId)).not.toContain("fora");
  });
  it("concluídas só com includeDone", () => {
    const its = buildAgenda(input({ tasks: [task({ done: true })], leads: [lead()] }));
    expect(weekOf(its, "2026-03-09").flatMap((d) => d.items)).toHaveLength(0);
    expect(weekOf(its, "2026-03-09", true).flatMap((d) => d.items)).toHaveLength(1);
  });
});

describe("agenda completa", () => {
  it("mistura tarefas e sugestões", () => {
    const its = buildAgenda(input({
      tasks: [task()], leads: [lead()],
      customers: [customer({ birthday: "1990-03-11" })],
      sales: [sale()], quotes: [quote()],
    }));
    expect(kinds(its).sort()).toEqual(["birthday", "purchase", "quote", "task"]);
  });
  it("sem dados: agenda vazia", () => {
    expect(buildAgenda(input())).toEqual([]);
  });
});
