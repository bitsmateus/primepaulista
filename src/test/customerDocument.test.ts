import { describe, it, expect } from "vitest";
import { isValidCnpj, formatCnpj, documentType, isValidDocument, formatDocument, maskDocument } from "@/lib/customers";

describe("CNPJ / documento do cliente", () => {
  it("valida CNPJ", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });
  it("formata CNPJ", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("detecta tipo e valida/formata documento", () => {
    expect(documentType("11222333000181")).toBe("PJ");
    expect(documentType("529.982.247-25")).toBe("PF");
    expect(isValidDocument("529.982.247-25")).toBe(true);
    expect(isValidDocument("11222333000181")).toBe(true);
    expect(isValidDocument("11222333000181", "PF")).toBe(false);
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("aplica máscara progressiva", () => {
    expect(maskDocument("11222333000181", "PJ")).toBe("11.222.333/0001-81");
    expect(maskDocument("112223", "PJ")).toBe("11.222.3");
    expect(maskDocument("52998224725", "PF")).toBe("529.982.247-25");
    expect(maskDocument("5299", "PF")).toBe("529.9");
  });
});
