import { describe, it, expect } from "vitest";
import { capitalizeName } from "@/lib/utils";

describe("capitalizeName", () => {
  it("capitaliza cada palavra, inclusive a 2ª e 3ª", () => {
    expect(capitalizeName("isabela aparecida bispo campos")).toBe("Isabela Aparecida Bispo Campos");
    expect(capitalizeName("Isabela Aparecida bispo campos")).toBe("Isabela Aparecida Bispo Campos");
    expect(capitalizeName("rafael rissi ")).toBe("Rafael Rissi ");
  });
  it("mantém partículas em minúsculo", () => {
    expect(capitalizeName("maria da silva e souza")).toBe("Maria da Silva e Souza");
  });
});
