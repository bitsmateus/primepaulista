import { describe, it, expect } from "vitest";
import {
  buildOSReport, OS_STATUSES, isOpenOS, needsNotification, filterOrders, DEFAULT_OS_FILTERS,
  receiptValueLine, effectiveCharged, chargedFieldLabel, isExempt, EVENT_BY_STATUS,
} from "@/lib/serviceOrders";
import { generateOSReceiptHTML } from "@/utils/osReceiptGenerator";
import { ServiceOrder } from "@/types/serviceOrder";

const mk = (over: Partial<ServiceOrder>): ServiceOrder => ({
  id: "abcdef12-0000-4000-8000-000000000000", customerName: "João Silva", customerPhone: "(11) 99999-0000", customerCpf: "",
  model: "iPhone 14 Pro", color: "", serialImei: "ABC123", batteryHealth: 90,
  reportedIssue: "Tela quebrada", technicalNotes: "",
  checklist: { capa: false, chip: false, carregador: false },
  status: "Em Reparo", priority: "Normal",
  partCost: 100, laborCost: 50, partDescription: "", partFromStock: false,
  chargedAmount: 400, taxes: 20, origin: "Cliente", costResponsibility: "Cliente",
  createdAt: new Date(2026, 5, 1), updatedAt: new Date(2026, 5, 1),
  ...over,
});

describe("fluxo de status (Fase 3)", () => {
  it("ordem das colunas do Kanban", () => {
    expect(OS_STATUSES).toEqual([
      "Aguardando Diagnóstico",
      "Em Diagnóstico",
      "Aguardando Aprovação",
      "Aguardando Peça",
      "Em Reparo",
      "Pronto para Retirada",
      "Entregue / Finalizado",
    ]);
  });
  it("aberta = tudo que não é Entregue / Finalizado (inclui os status novos)", () => {
    for (const s of OS_STATUSES) {
      expect(isOpenOS({ status: s })).toBe(s !== "Entregue / Finalizado");
    }
  });
  it("dashboard conta os status novos e mantém o conceito de aberta", () => {
    const now = new Date(2026, 5, 15);
    const rep = buildOSReport(
      [mk({ id: "a", status: "Em Diagnóstico" }), mk({ id: "b", status: "Aguardando Aprovação" }), mk({ id: "c", status: "Entregue / Finalizado", completedAt: now })],
      now
    );
    expect(rep.open).toBe(2);
    expect(rep.byStatus.map((s) => s.status)).toEqual(OS_STATUSES);
    expect(rep.byStatus.find((s) => s.status === "Em Diagnóstico")?.count).toBe(1);
    expect(rep.byStatus.find((s) => s.status === "Aguardando Aprovação")?.count).toBe(1);
  });
  it("status que disparam WhatsApp", () => {
    expect(EVENT_BY_STATUS["Aguardando Aprovação"]).toBe("aguardando_aprovacao");
    expect(EVENT_BY_STATUS["Pronto para Retirada"]).toBe("pronto_retirada");
    expect(EVENT_BY_STATUS["Entregue / Finalizado"]).toBe("entregue");
    expect(EVENT_BY_STATUS["Em Reparo"]).toBeUndefined();
  });
});

describe("quem paga o custo", () => {
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  it("garantia e cortesia são isentas; cliente e dividido não", () => {
    expect(isExempt("Garantia da Loja")).toBe(true);
    expect(isExempt("Cortesia / Loja")).toBe(true);
    expect(isExempt("Cliente")).toBe(false);
    expect(isExempt("Dividido / Co-participação")).toBe(false);
  });
  it("valor efetivo zera nas isentas mesmo com valor digitado", () => {
    expect(effectiveCharged({ chargedAmount: 300, costResponsibility: "Garantia da Loja" })).toBe(0);
    expect(effectiveCharged({ chargedAmount: 300, costResponsibility: "Cortesia / Loja" })).toBe(0);
    expect(effectiveCharged({ chargedAmount: 300, costResponsibility: "Cliente" })).toBe(300);
    expect(effectiveCharged({ chargedAmount: 120, costResponsibility: "Dividido / Co-participação" })).toBe(120);
  });
  it("rótulo do campo muda no custo dividido", () => {
    expect(chargedFieldLabel("Cliente")).toBe("Valor Cobrado (R$)");
    expect(chargedFieldLabel("Dividido / Co-participação")).toBe("Parte paga pelo cliente (R$)");
  });
  it("recibo: linhas de valor por responsabilidade", () => {
    expect(receiptValueLine({ chargedAmount: 300, costResponsibility: "Cliente" }, fmt)).toEqual({ label: "Total do serviço", value: "R$ 300,00" });
    expect(receiptValueLine({ chargedAmount: 300, costResponsibility: "Garantia da Loja" }, fmt).value).toBe("R$ 0,00 (ISENTO - COBERTO PELA GARANTIA DA LOJA)");
    expect(receiptValueLine({ chargedAmount: 300, costResponsibility: "Cortesia / Loja" }, fmt).value).toBe("R$ 0,00 (ISENTO - CORTESIA DA LOJA)");
    const div = receiptValueLine({ chargedAmount: 120, costResponsibility: "Dividido / Co-participação" }, fmt);
    expect(div).toEqual({ label: "Valor pago pelo cliente", value: "R$ 120,00", note: "Custo dividido com a loja" });
  });
  it("receita do dashboard = valor cobrado (sem dupla contagem); isento não gera receita", () => {
    const now = new Date(2026, 5, 15);
    const done = (over: Partial<ServiceOrder>) =>
      mk({ status: "Entregue / Finalizado", completedAt: new Date(2026, 5, 10), partCost: 100, taxes: 0, ...over });
    const rep = buildOSReport(
      [
        done({ id: "a", chargedAmount: 300 }),
        done({ id: "b", chargedAmount: 0, costResponsibility: "Garantia da Loja" }),
        done({ id: "c", chargedAmount: 120, costResponsibility: "Dividido / Co-participação" }),
      ],
      now
    );
    expect(rep.monthRevenue).toBe(420);
    // o custo da peça de todas entra: (300-100) + (0-100) + (120-100)
    expect(rep.monthProfit).toBe(120);
  });
});

describe("recibo de OS (HTML)", () => {
  it("escapa HTML digitado (nome, defeito, observações, IMEI)", () => {
    const html = generateOSReceiptHTML(
      mk({
        customerName: "<img src=x onerror=window.__xss=1>",
        reportedIssue: "<script>alert(1)</script>",
        technicalNotes: "\"><b>negrito</b>",
        serialImei: "<i>1</i>",
        partDescription: "<u>peça</u>",
      })
    );
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<b>negrito</b>");
    expect(html).toContain("&lt;img src=x onerror=window.__xss=1&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
  it("garantia: mostra R$ 0,00 (ISENTO - COBERTO PELA GARANTIA DA LOJA)", () => {
    const html = generateOSReceiptHTML(mk({ costResponsibility: "Garantia da Loja", chargedAmount: 0 }));
    expect(html).toMatch(/R\$\s0,00 \(ISENTO - COBERTO PELA GARANTIA DA LOJA\)/);
  });
  it("cortesia: mostra ISENTO - CORTESIA DA LOJA", () => {
    const html = generateOSReceiptHTML(mk({ costResponsibility: "Cortesia / Loja", chargedAmount: 0 }));
    expect(html).toMatch(/ISENTO - CORTESIA DA LOJA/);
  });
  it("dividido: mostra 'Custo dividido com a loja' e a parte do cliente", () => {
    const html = generateOSReceiptHTML(mk({ costResponsibility: "Dividido / Co-participação", chargedAmount: 120 }));
    expect(html).toContain("Custo dividido com a loja");
    expect(html).toContain("Valor pago pelo cliente");
    expect(html).toMatch(/R\$\s120,00/);
  });
  it("cliente: total normal, sem texto de isenção", () => {
    const html = generateOSReceiptHTML(mk({ chargedAmount: 250 }));
    expect(html).toContain("Total do serviço");
    expect(html).not.toContain("ISENTO");
  });
  it("origem estoque aparece no recibo", () => {
    expect(generateOSReceiptHTML(mk({ origin: "Estoque da loja" }))).toContain("Aparelho do estoque da loja");
  });
});

describe("filtro Pendentes (aviso por WhatsApp)", () => {
  const base = { origin: "Cliente" as const, customerPhone: "(11) 98888-7777" };
  it("Pronto para Retirada sem aviso enviado é pendente", () => {
    expect(needsNotification({ ...base, status: "Pronto para Retirada", sentEvents: [] })).toBe(true);
    expect(needsNotification({ ...base, status: "Pronto para Retirada" })).toBe(true);
  });
  it("Aguardando Aprovação sem aviso é pendente", () => {
    expect(needsNotification({ ...base, status: "Aguardando Aprovação", sentEvents: [] })).toBe(true);
  });
  it("aviso enviado para o evento da etapa tira a pendência", () => {
    expect(needsNotification({ ...base, status: "Pronto para Retirada", sentEvents: ["pronto_retirada"] })).toBe(false);
    expect(needsNotification({ ...base, status: "Aguardando Aprovação", sentEvents: ["aguardando_aprovacao"] })).toBe(false);
  });
  it("aviso de OUTRO evento não conta", () => {
    expect(needsNotification({ ...base, status: "Pronto para Retirada", sentEvents: ["aguardando_aprovacao"] })).toBe(true);
  });
  it("outras etapas e OS finalizada nunca são pendentes", () => {
    for (const s of ["Aguardando Diagnóstico", "Em Diagnóstico", "Aguardando Peça", "Em Reparo", "Entregue / Finalizado"] as const) {
      expect(needsNotification({ ...base, status: s, sentEvents: [] })).toBe(false);
    }
  });
  it("evento desligado não gera pendência", () => {
    expect(needsNotification({ ...base, status: "Pronto para Retirada", sentEvents: [] }, { pronto_retirada: false })).toBe(false);
    expect(needsNotification({ ...base, status: "Pronto para Retirada", sentEvents: [] }, { pronto_retirada: true })).toBe(true);
  });
  it("OS de estoque sem telefone não é pendente; com telefone é", () => {
    expect(needsNotification({ origin: "Estoque da loja", customerPhone: "", status: "Pronto para Retirada", sentEvents: [] })).toBe(false);
    expect(needsNotification({ origin: "Estoque da loja", customerPhone: "11988887777", status: "Pronto para Retirada", sentEvents: [] })).toBe(true);
  });
  it("OS de cliente sem telefone continua pendente (precisa corrigir o telefone)", () => {
    expect(needsNotification({ origin: "Cliente", customerPhone: "", status: "Pronto para Retirada", sentEvents: [] })).toBe(true);
  });
});

describe("filtros do painel", () => {
  const orders = [
    mk({ id: "1", origin: "Cliente", costResponsibility: "Cliente", status: "Pronto para Retirada", sentEvents: [] }),
    mk({ id: "2", origin: "Estoque da loja", costResponsibility: "Garantia da Loja", status: "Em Reparo", priority: "Urgente" }),
    mk({ id: "3", origin: "Cliente", costResponsibility: "Dividido / Co-participação", status: "Pronto para Retirada", sentEvents: ["pronto_retirada"] }),
  ];
  const ids = (o: ServiceOrder[]) => o.map((x) => x.id);
  it("sem filtros devolve tudo", () => expect(ids(filterOrders(orders, DEFAULT_OS_FILTERS))).toEqual(["1", "2", "3"]));
  it("por origem", () => expect(ids(filterOrders(orders, { ...DEFAULT_OS_FILTERS, origin: "Estoque da loja" }))).toEqual(["2"]));
  it("por quem paga", () => expect(ids(filterOrders(orders, { ...DEFAULT_OS_FILTERS, responsibility: "Dividido / Co-participação" }))).toEqual(["3"]));
  it("por prioridade", () => expect(ids(filterOrders(orders, { ...DEFAULT_OS_FILTERS, priority: "Urgente" }))).toEqual(["2"]));
  it("somente pendentes", () => expect(ids(filterOrders(orders, { ...DEFAULT_OS_FILTERS, pendingOnly: true }))).toEqual(["1"]));
  it("filtros se combinam (E)", () => {
    expect(ids(filterOrders(orders, { ...DEFAULT_OS_FILTERS, origin: "Cliente", pendingOnly: true }))).toEqual(["1"]);
    expect(ids(filterOrders(orders, { ...DEFAULT_OS_FILTERS, origin: "Estoque da loja", pendingOnly: true }))).toEqual([]);
  });
});
