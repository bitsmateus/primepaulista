import { describe, it, expect } from "vitest";
import {
  osProfit, daysInLab, isOverdue, osMatchesSearch, buildOSReport,
} from "@/lib/serviceOrders";
import { ServiceOrder } from "@/types/serviceOrder";

const mk = (over: Partial<ServiceOrder>): ServiceOrder => ({
  id: "o1", customerName: "João Silva", customerPhone: "(11) 99999-0000", customerCpf: "",
  model: "iPhone 14 Pro", color: "", serialImei: "ABC123", batteryHealth: 90,
  reportedIssue: "Tela quebrada", technicalNotes: "",
  checklist: { capa: false, chip: false, carregador: false },
  status: "Em Reparo", priority: "Normal",
  partCost: 100, laborCost: 50, partDescription: "", partFromStock: false,
  chargedAmount: 400, taxes: 20,
  createdAt: new Date(2026, 5, 1), updatedAt: new Date(2026, 5, 1),
  ...over,
});

describe("lucro da OS", () => {
  it("cobrado − peça − impostos (mão de obra não entra)", () => {
    expect(osProfit(mk({ chargedAmount: 400, partCost: 100, taxes: 20 }))).toBe(280);
  });
});

describe("dias no lab", () => {
  it("conta da abertura até agora para OS aberta", () => {
    const now = new Date(2026, 5, 11);
    expect(daysInLab(mk({ createdAt: new Date(2026, 5, 1) }), now)).toBe(10);
  });
  it("para finalizada conta até a conclusão", () => {
    const now = new Date(2026, 5, 30);
    const o = mk({ status: "Entregue / Finalizado", createdAt: new Date(2026, 5, 1), completedAt: new Date(2026, 5, 6) });
    expect(daysInLab(o, now)).toBe(5);
  });
});

describe("atraso (SLA)", () => {
  const now = new Date(2026, 5, 11);
  it("aberta há mais de 3 dias é atrasada", () => {
    expect(isOverdue(mk({ createdAt: new Date(2026, 5, 1) }), now)).toBe(true);
  });
  it("recente não é atrasada", () => {
    expect(isOverdue(mk({ createdAt: new Date(2026, 5, 10) }), now)).toBe(false);
  });
  it("finalizada nunca é atrasada", () => {
    expect(isOverdue(mk({ status: "Entregue / Finalizado", createdAt: new Date(2026, 0, 1) }), now)).toBe(false);
  });
});

describe("busca de OS", () => {
  const o = mk({ customerName: "Maria Souza", model: "iPhone 15", serialImei: "XYZ999", customerPhone: "(11) 98888-7777", reportedIssue: "Não carrega" });
  it("acha por nome", () => expect(osMatchesSearch(o, "maria")).toBe(true));
  it("acha por modelo", () => expect(osMatchesSearch(o, "iphone 15")).toBe(true));
  it("acha por IMEI", () => expect(osMatchesSearch(o, "xyz999")).toBe(true));
  it("acha por defeito", () => expect(osMatchesSearch(o, "carrega")).toBe(true));
  it("acha por telefone sem formatação", () => expect(osMatchesSearch(o, "988887777")).toBe(true));
  it("query vazia retorna true", () => expect(osMatchesSearch(o, "")).toBe(true));
  it("não acha o ausente", () => expect(osMatchesSearch(o, "samsung")).toBe(false));
});

describe("relatório do dashboard", () => {
  const now = new Date(2026, 5, 15);
  const orders = [
    mk({ id: "a", status: "Em Reparo", priority: "Urgente", createdAt: new Date(2026, 5, 1) }),
    mk({ id: "b", status: "Pronto para Retirada", priority: "Normal", createdAt: new Date(2026, 5, 14) }),
    mk({ id: "c", status: "Entregue / Finalizado", priority: "Normal", completedAt: new Date(2026, 5, 10), chargedAmount: 500, partCost: 100, taxes: 0, createdAt: new Date(2026, 5, 5) }),
    mk({ id: "d", status: "Entregue / Finalizado", priority: "Crítico", completedAt: new Date(2026, 4, 20), chargedAmount: 300, partCost: 50, taxes: 0, createdAt: new Date(2026, 4, 18) }),
  ];

  it("conta abertas, prontas, finalizadas, atrasadas e urgentes", () => {
    const rep = buildOSReport(orders, now);
    expect(rep.total).toBe(4);
    expect(rep.open).toBe(2); // a, b
    expect(rep.ready).toBe(1); // b
    expect(rep.finalized).toBe(2); // c, d
    expect(rep.overdue).toBe(1); // a (aberta desde dia 1)
    expect(rep.urgent).toBe(1); // a (b é Normal; c/d finalizadas não contam como abertas)
  });

  it("faturamento, lucro e ticket médio só do mês corrente", () => {
    const rep = buildOSReport(orders, now);
    // só 'c' foi finalizada em junho/2026
    expect(rep.monthRevenue).toBe(500);
    expect(rep.monthProfit).toBe(400);
    expect(rep.avgTicket).toBe(500);
  });

  it("agrega por status e prioridade", () => {
    const rep = buildOSReport(orders, now);
    expect(rep.byStatus.find((s) => s.status === "Entregue / Finalizado")?.count).toBe(2);
    expect(rep.byPriority.find((p) => p.priority === "Normal")?.count).toBe(2);
  });
});
