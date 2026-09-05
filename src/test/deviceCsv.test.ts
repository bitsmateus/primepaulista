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
