import { describe, it, expect } from "vitest";
import { parseDevicesCsv } from "@/lib/deviceCsv";

describe("parseDevicesCsv", () => {
  it("lê cabeçalho + linhas (separador ;) e mapeia campos", () => {
    const csv = [
      "Categoria;Modelo;Capacidade;Cor;Condição;Bateria %;Serial/IMEI;Fornecedor;Custo;Preço de venda",
      "iPhone;iPhone 15;128;Preto;Lacrado;100;ABC123;Fornec X;5000.00;6200.00",
      "iPad;iPad Air;256;Cinza;Seminovo;90;IMEI9;;4000;5000",
    ].join("\n");
    const { devices, errors } = parseDevicesCsv(csv);
    expect(errors).toHaveLength(0);
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({
      category: "iPhone", model: "iPhone 15", capacity: "128", color: "Preto",
      condition: "Lacrado", batteryHealth: 100, cost: 5000, salePrice: 6200, status: "Disponível",
    });
    expect(devices[1].condition).toBe("Seminovo");
    expect(devices[1].salePrice).toBe(5000);
  });

  it("aceita número no formato pt-BR (5.000,00)", () => {
    const csv = "Modelo;Custo\niPhone 14;5.000,50";
    const { devices } = parseDevicesCsv(csv);
    expect(devices[0].cost).toBe(5000.5);
  });

  it("aceita separador vírgula", () => {
    const csv = "Modelo,Custo\niPhone 13,3000";
    const { devices } = parseDevicesCsv(csv);
    expect(devices[0].model).toBe("iPhone 13");
    expect(devices[0].cost).toBe(3000);
  });

  it("aceita separador tabulação (colado do Excel/Google Sheets)", () => {
    const csv = "Categoria\tModelo\tCusto\tSerial/IMEI\niPhone\tiPhone 13\t1000\tABC123";
    const { devices, errors } = parseDevicesCsv(csv);
    expect(errors).toHaveLength(0);
    expect(devices).toHaveLength(1);
    expect(devices[0].model).toBe("iPhone 13");
    expect(devices[0].cost).toBe(1000);
  });

  it("remove espaços internos do serial/IMEI (comum ao colar do Excel)", () => {
    const csv = "Modelo\tSerial/IMEI\niPhone 13\tD V 6 F F 5 F T N 7 3 6";
    const { devices } = parseDevicesCsv(csv);
    expect(devices[0].serialImei).toBe("DV6FF5FTN736");
  });

  it("aceita bateria com símbolo % (ex.: 69%)", () => {
    const csv = "Modelo\tBateria\niPhone 13\t69%";
    const { devices } = parseDevicesCsv(csv);
    expect(devices[0].batteryHealth).toBe(69);
  });

  it("ignora linha sem modelo e reporta erro", () => {
    const csv = "Modelo;Custo\n;1000\niPhone 12;2000";
    const { devices, errors } = parseDevicesCsv(csv);
    expect(devices).toHaveLength(1);
    expect(errors.length).toBe(1);
  });

  it("erro quando falta a coluna Modelo", () => {
    const csv = "Categoria;Custo\niPhone;1000";
    const { devices, errors } = parseDevicesCsv(csv);
    expect(devices).toHaveLength(0);
    expect(errors[0]).toMatch(/Modelo/);
  });

  it("categoria vazia vira iPhone e sem preço fica undefined", () => {
    const csv = "Modelo;Custo\niPhone 11;2000";
    const { devices } = parseDevicesCsv(csv);
    expect(devices[0].category).toBe("iPhone");
    expect(devices[0].salePrice).toBeUndefined();
  });
});

import {
  parseDevicesSheet, validateImport, cellToString, DEVICE_TEMPLATE_HEADERS, DEVICE_TEMPLATE_EXAMPLE, parseDeviceRows,
} from "@/lib/deviceCsv";

describe("parseDevicesCsv — colunas novas", () => {
  it("lê marca, local, IMEI 1, IMEI 2, serial, entrada e observações", () => {
    const csv = [
      "Categoria;Marca;Modelo;Capacidade;Cor;Condição;IMEI 1;IMEI 2;Serial;Fornecedor;Custo;Local;Data de entrada;Observações",
      "iPhone;Apple;iPhone 15;128;Preto;Seminovo;359000000000001;359000000000002;F2LABC;Forn;3000;Vitrine 1;05/03/2026;tela trocada",
    ].join("\n");
    const { devices, errors } = parseDevicesCsv(csv);
    expect(errors).toHaveLength(0);
    expect(devices[0]).toMatchObject({
      brand: "Apple", location: "Vitrine 1", serialImei: "359000000000001", imei2: "359000000000002",
      serial: "F2LABC", notes: "tela trocada", condition: "Seminovo",
    });
    expect(devices[0].entryDate?.getFullYear()).toBe(2026);
    expect(devices[0].entryDate?.getMonth()).toBe(2);
    expect(devices[0].entryDate?.getDate()).toBe(5);
  });
  it("sem marca/local usa Apple/Estoque", () => {
    const { devices } = parseDevicesCsv("Modelo\niPhone 11");
    expect(devices[0].brand).toBe("Apple");
    expect(devices[0].location).toBe("Estoque");
  });
  it("cabeçalho antigo 'Serial/IMEI' continua valendo como IMEI 1", () => {
    const { devices } = parseDevicesCsv("Modelo;Serial/IMEI\niPhone 11;ABC");
    expect(devices[0].serialImei).toBe("ABC");
    expect(devices[0].serial).toBe("");
  });
  it("'Serial' sozinho é o número de série", () => {
    const { devices } = parseDevicesCsv("Modelo;Serial\niPhone 11;F2L1");
    expect(devices[0].serial).toBe("F2L1");
    expect(devices[0].serialImei).toBe("");
  });
  it("preço de compra vira custo e preço de venda continua sendo venda", () => {
    const { devices } = parseDevicesCsv("Modelo;Preço de compra;Preço de venda\niPhone 11;2000;3000");
    expect(devices[0].cost).toBe(2000);
    expect(devices[0].salePrice).toBe(3000);
  });
  it("'5.000' (ponto de milhar) vale cinco mil", () => {
    const { devices } = parseDevicesCsv("Modelo;Custo\niPhone 11;5.000");
    expect(devices[0].cost).toBe(5000);
  });
  it("data inválida é ignorada, não quebra", () => {
    const { devices } = parseDevicesCsv("Modelo;Data de entrada\niPhone 11;31/02/2026");
    expect(devices[0].entryDate).toBeUndefined();
  });
  it("guarda o número da linha do arquivo para reportar erros", () => {
    const { rowNumbers } = parseDevicesCsv("Modelo\n\niPhone 11\niPhone 12");
    expect(rowNumbers).toEqual([3, 4]);
  });
});

describe("Excel (.xlsx)", () => {
  it("IMEI numérico grande não vira notação científica", () => {
    expect(cellToString(359000000000001)).toBe("359000000000001");
  });
  it("decimal e texto", () => {
    expect(cellToString(5000.5)).toBe("5000.5");
    expect(cellToString("  abc ")).toBe("abc");
    expect(cellToString(null)).toBe("");
  });
  it("data do Excel vira dd/mm/aaaa", () => {
    expect(cellToString(new Date(2026, 5, 1))).toBe("01/06/2026");
  });
  it("lê planilha com números e datas nativos", () => {
    const rows: unknown[][] = [
      ["Marca", "Modelo", "IMEI 1", "Custo", "Data de entrada"],
      ["Apple", "iPhone 14", 359000000000123, 4500.5, new Date(2026, 0, 10)],
    ];
    const { devices, errors } = parseDevicesSheet(rows);
    expect(errors).toHaveLength(0);
    expect(devices[0].serialImei).toBe("359000000000123");
    expect(devices[0].cost).toBe(4500.5);
    expect(devices[0].entryDate?.getDate()).toBe(10);
  });
  it("planilha só com cabeçalho é erro", () => {
    expect(parseDevicesSheet([["Modelo"]]).errors[0]).toMatch(/vazio/);
  });
  it("ignora linhas totalmente vazias", () => {
    const { devices } = parseDevicesSheet([["Modelo"], [null], ["iPhone 11"], ["", ""]]);
    expect(devices).toHaveLength(1);
  });
});

describe("validateImport", () => {
  const parse = (csv: string) => parseDevicesCsv(csv);
  const existing = [
    { status: "Disponível" as const, serialImei: "AAA", imei2: "", serial: "" },
    { status: "Vendido" as const, serialImei: "VENDIDO", imei2: "", serial: "" },
  ];

  it("IMEI que já está no estoque ativo é erro", () => {
    const r = validateImport(parse("Modelo;IMEI 1\niPhone 11;AAA"), existing);
    expect(r[0].valid).toBe(false);
    expect(r[0].errors[0]).toMatch(/já consta/);
  });
  it("IMEI de aparelho já vendido pode voltar (ex.: troca)", () => {
    const r = validateImport(parse("Modelo;IMEI 1\niPhone 11;VENDIDO"), existing);
    expect(r[0].valid).toBe(true);
  });
  it("comparação ignora maiúsculas e espaços", () => {
    const r = validateImport(parse("Modelo;IMEI 1\niPhone 11;a a a"), existing);
    expect(r[0].valid).toBe(false);
  });
  it("repetido dentro do arquivo: a 1ª vale, a 2ª é erro", () => {
    const r = validateImport(parse("Modelo;IMEI 1\niPhone 11;XYZ\niPhone 11;XYZ"), []);
    expect(r[0].valid).toBe(true);
    expect(r[1].valid).toBe(false);
    expect(r[1].errors[0]).toMatch(/repetido/);
  });
  it("linha inválida não 'consome' o identificador", () => {
    const r = validateImport(parse("Modelo;IMEI 1;IMEI 2\niPhone 11;AAA;NOVO\niPhone 12;;NOVO"), existing);
    expect(r[0].valid).toBe(false);
    expect(r[1].valid).toBe(true);
  });
  it("sem nenhum identificador vira aviso, não erro", () => {
    const r = validateImport(parse("Modelo;Custo\niPhone 11;1000"), []);
    expect(r[0].valid).toBe(true);
    expect(r[0].warnings.join()).toMatch(/série ausente/);
  });
  it("custo zerado gera aviso", () => {
    const r = validateImport(parse("Modelo;IMEI 1\niPhone 11;Z1"), []);
    expect(r[0].warnings.join()).toMatch(/Custo/);
  });
  it("com ignoreExisting o estoque atual não conta (vai ser apagado)", () => {
    const r = validateImport(parse("Modelo;IMEI 1\niPhone 11;AAA"), existing, { ignoreExisting: true });
    expect(r[0].valid).toBe(true);
  });
  it("mantém o número da linha original", () => {
    const r = validateImport(parse("Modelo;IMEI 1\n\niPhone 11;AAA"), existing);
    expect(r[0].rowNumber).toBe(3);
  });
});

describe("modelo de planilha", () => {
  it("o modelo é lido de volta sem erros e sem perder colunas", () => {
    const { devices, errors } = parseDeviceRows([DEVICE_TEMPLATE_HEADERS, DEVICE_TEMPLATE_EXAMPLE]);
    expect(errors).toHaveLength(0);
    expect(devices[0]).toMatchObject({
      category: "iPhone", brand: "Apple", model: "iPhone 15 Pro", capacity: "256",
      condition: "Lacrado", serialImei: "359000000000000", imei2: "359000000000001",
      serial: "F2LXXXXXXXXX", cost: 6000, salePrice: 7500, location: "Vitrine 1",
    });
  });
});
