import { describe, it, expect } from "vitest";
import { parseCustomersCsv, dedupeCustomers } from "@/lib/customerCsv";

describe("parse CSV de clientes", () => {
  it("lê cabeçalho por nome e normaliza origem", () => {
    const csv = "Nome;CPF;WhatsApp;Aniversário;Origem\nMaria Souza;529.982.247-25;(11) 98888-7777;1990-06-15;Instagram\nJoão;;11999990000;;indicação";
    const r = parseCustomersCsv(csv);
    expect(r.customers).toHaveLength(2);
    expect(r.customers[0].name).toBe("Maria Souza");
    expect(r.customers[0].leadOrigin).toBe("Instagram");
    expect(r.customers[1].leadOrigin).toBe("Indicação");
  });

  it("aceita separador vírgula e colunas alternativas (telefone)", () => {
    const csv = "nome,telefone\nPedro,11977776666";
    const r = parseCustomersCsv(csv);
    expect(r.customers[0].whatsapp).toBe("11977776666");
  });

  it("erro quando não há coluna Nome", () => {
    expect(parseCustomersCsv("cpf;telefone\n123;456").errors.length).toBeGreaterThan(0);
  });

  it("linha sem nome é ignorada com aviso", () => {
    const r = parseCustomersCsv("Nome;CPF\n;111\nAna;222");
    expect(r.customers).toHaveLength(1);
    expect(r.errors.length).toBe(1);
  });
});

describe("deduplicação", () => {
  const existing = [{ cpf: "529.982.247-25", whatsapp: "11988887777" }];

  it("ignora CPF já existente", () => {
    const { toCreate, ignored } = dedupeCustomers(
      [{ name: "Maria", cpf: "52998224725", whatsapp: "", birthday: "" }],
      existing
    );
    expect(toCreate).toHaveLength(0);
    expect(ignored).toHaveLength(1);
  });

  it("ignora WhatsApp já existente (ignorando formatação)", () => {
    const { toCreate } = dedupeCustomers(
      [{ name: "X", cpf: "", whatsapp: "(11) 98888-7777", birthday: "" }],
      existing
    );
    expect(toCreate).toHaveLength(0);
  });

  it("deduplica dentro do próprio lote", () => {
    const { toCreate, ignored } = dedupeCustomers(
      [
        { name: "A", cpf: "111", whatsapp: "11900000000", birthday: "" },
        { name: "A2", cpf: "", whatsapp: "11900000000", birthday: "" },
      ],
      []
    );
    expect(toCreate).toHaveLength(1);
    expect(ignored).toHaveLength(1);
  });

  it("cria quando não há duplicidade", () => {
    const { toCreate } = dedupeCustomers(
      [{ name: "Novo", cpf: "99999999999", whatsapp: "11912345678", birthday: "" }],
      existing
    );
    expect(toCreate).toHaveLength(1);
  });
});
