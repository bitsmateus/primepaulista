import { describe, it, expect } from "vitest";
import { searchScore, rankBySearch } from "@/lib/search";

describe("busca por relevância", () => {
  it("ignora acentos e aceita palavras fora de ordem", () => {
    expect(searchScore("Marco Aurélio Silva", "silva aurelio")).not.toBeNull();
    expect(searchScore("Marco Aurélio Silva", "pedro")).toBeNull();
  });
  it("coloca no topo o que começa com o termo", () => {
    const names = ["Capa de Couro 15", "Película Capa", "Capa Acrílico 15", "Carregador"];
    expect(rankBySearch(names, "capa", (n) => n)).toEqual(["Capa de Couro 15", "Capa Acrílico 15", "Película Capa"]);
  });
  it("nome exato vem primeiro", () => {
    expect(rankBySearch(["Ana Maria Souza", "Ana"], "ana", (n) => n)[0]).toBe("Ana");
  });
});
