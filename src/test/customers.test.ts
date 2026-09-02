import { describe, it, expect } from "vitest";
import {
  isValidCpf, formatCpf, formatPhone, customerMatchesSearch,
  buildCustomerStats, buildCustomerReport, birthdayMonth, formatBirthday,
} from "@/lib/customers";
import { Customer, Sale } from "@/types/inventory";

const mkCustomer = (over: Partial<Customer>): Customer => ({
  id: "c1", name: "João Silva", cpf: "", whatsapp: "", birthday: "",
  leadOrigin: "Instagram", createdAt: new Date(), ...over,
});

describe("CPF", () => {
  it("valida CPF correto", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });
  it("rejeita CPF inválido e repetidos", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf("12345678900")).toBe(false);
  });
  it("formata CPF", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });
});

describe("telefone", () => {
  it("formata celular (11 dígitos)", () => {
    expect(formatPhone("11999998888")).toBe("(11) 99999-8888");
  });
  it("formata fixo (10 dígitos)", () => {
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
  });
});

describe("busca de cliente", () => {
  const c = mkCustomer({ name: "Maria Souza", cpf: "529.982.247-25", whatsapp: "(11) 98888-7777" });
  it("acha por nome", () => expect(customerMatchesSearch(c, "maria")).toBe(true));
  it("acha por CPF ignorando formatação", () => expect(customerMatchesSearch(c, "52998224725")).toBe(true));
  it("acha por telefone ignorando formatação", () => expect(customerMatchesSearch(c, "988887777")).toBe(true));
  it("não acha o que não existe", () => expect(customerMatchesSearch(c, "pedro")).toBe(false));
  it("query vazia retorna true", () => expect(customerMatchesSearch(c, "")).toBe(true));
});

describe("aniversário", () => {
  it("mês a partir de YYYY-MM-DD", () => expect(birthdayMonth("1990-06-15")).toBe(6));
  it("mês a partir de dd/mm", () => expect(birthdayMonth("15/06")).toBe(6));
  it("formata para dd/mm", () => expect(formatBirthday("1990-06-15")).toBe("15/06"));
  it("vazio → traço", () => expect(formatBirthday("")).toBe("—"));
});

describe("estatísticas e relatório", () => {
  const sale = (id: string, custId: string, total: number, date: Date): Sale => ({
    id, customer: mkCustomer({ id: custId }), items: [], payments: [],
    seller: "Gabriel" as Sale["seller"], subtotal: total, tradeInDiscount: 0,
    discount: 0, total, giftsCost: 0, requiresInvoice: false, createdAt: date,
  });
  const sales = [
    sale("s1", "c1", 1000, new Date("2026-01-10")),
    sale("s2", "c1", 500, new Date("2026-02-10")),
    sale("s3", "c2", 2000, new Date("2026-02-15")),
  ];

  it("agrega compras por cliente", () => {
    const stats = buildCustomerStats(sales);
    expect(stats["c1"].count).toBe(2);
    expect(stats["c1"].total).toBe(1500);
    expect(stats["c2"].count).toBe(1);
  });

  it("relatório: total, compradores, por origem", () => {
    const now = new Date(2026, 5, 15);
    const customers = [
      mkCustomer({ id: "c1", leadOrigin: "Instagram", createdAt: new Date(2026, 5, 5) }),
      mkCustomer({ id: "c2", leadOrigin: "Indicação", createdAt: new Date(2026, 0, 1) }),
      mkCustomer({ id: "c3", leadOrigin: "Instagram", createdAt: new Date(2026, 5, 10) }),
    ];
    const stats = buildCustomerStats(sales);
    const r = buildCustomerReport(customers, stats, now);
    expect(r.total).toBe(3);
    expect(r.buyers).toBe(2); // c1 e c2 compraram
    expect(r.newThisMonth).toBe(2); // c1 e c3 em junho
    expect(r.byOrigin).toEqual({ Instagram: 2, "Indicação": 1 });
  });
});
