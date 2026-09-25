import { describe, it, expect } from "vitest";
import { canonicalModel, modelGroupKey, modelKey, suggestModelRenames } from "@/lib/modelName";

describe("canonicalModel (iPhone)", () => {
  it("nome só com número vira iPhone N", () => {
    expect(canonicalModel("iPhone", "14")).toBe("iPhone 14");
    expect(canonicalModel("iPhone", "13")).toBe("iPhone 13");
  });
  it("abreviação PM vira Pro Max", () => {
    expect(canonicalModel("iPhone", "16 PM")).toBe("iPhone 16 Pro Max");
    expect(canonicalModel("iPhone", "15 pm")).toBe("iPhone 15 Pro Max");
    expect(canonicalModel("iPhone", "14 P.M")).toBe("iPhone 14 Pro Max");
  });
  it("Pro Max escrito de várias formas", () => {
    expect(canonicalModel("iPhone", "iphone 16 promax")).toBe("iPhone 16 Pro Max");
    expect(canonicalModel("iPhone", "16 Pro-Max")).toBe("iPhone 16 Pro Max");
    expect(canonicalModel("iPhone", "IPHONE 16 PRO MAX")).toBe("iPhone 16 Pro Max");
  });
  it("caixa e espaços duplicados são normalizados", () => {
    expect(canonicalModel("iPhone", "  iphone   15   pro ")).toBe("iPhone 15 Pro");
    expect(canonicalModel("iPhone", "Iphone 12 mini")).toBe("iPhone 12 mini");
  });
  it("modelos já corretos ficam iguais", () => {
    for (const m of ["iPhone 15 Pro Max", "iPhone 16e", "iPhone SE (3ª geração)", "iPhone XR"]) {
      expect(canonicalModel("iPhone", m)).toBe(m);
    }
  });
  it("SE 3 casa com o catálogo", () => {
    expect(canonicalModel("iPhone", "SE 3")).toBe("iPhone SE (3ª geração)");
    expect(canonicalModel("iPhone", "iphone se 2")).toBe("iPhone SE (2ª geração)");
  });
  it("Apple no começo é removido", () => {
    expect(canonicalModel("iPhone", "Apple iPhone 13")).toBe("iPhone 13");
  });
  it("sem categoria assume iPhone", () => {
    expect(canonicalModel(undefined, "14")).toBe("iPhone 14");
  });
  it("modelo desconhecido só é limpo", () => {
    expect(canonicalModel("iPhone", "iPhone 99  Ultra")).toBe("iPhone 99 Ultra");
  });
  it("vazio devolve vazio", () => {
    expect(canonicalModel("iPhone", "   ")).toBe("");
  });
});

describe("canonicalModel (outras categorias)", () => {
  it("casa com o catálogo ignorando caixa", () => {
    expect(canonicalModel("AirPods", "airpods pro 2")).toBe("AirPods Pro 2");
    expect(canonicalModel("Apple Watch", "apple watch series 9")).toBe("Apple Watch Series 9");
  });
  it("categoria livre (Celular): só limpa espaços e mantém a caixa", () => {
    expect(canonicalModel("Celular", " Galaxy   S24 ")).toBe("Galaxy S24");
    expect(canonicalModel("Celular", "14")).toBe("14"); // não é iPhone: não inventa prefixo
  });
});

describe("modelGroupKey", () => {
  it("'14', 'iphone 14' e 'iPhone 14' são o mesmo grupo", () => {
    const k = modelGroupKey("iPhone", "iPhone 14");
    expect(modelGroupKey("iPhone", "14")).toBe(k);
    expect(modelGroupKey("iPhone", "iphone 14")).toBe(k);
  });
  it("'16 PM' e 'iPhone 16 Pro Max' são o mesmo grupo, e 16 Pro é outro", () => {
    expect(modelGroupKey("iPhone", "16 PM")).toBe(modelGroupKey("iPhone", "iPhone 16 Pro Max"));
    expect(modelGroupKey("iPhone", "16 Pro")).not.toBe(modelGroupKey("iPhone", "16 PM"));
  });
  it("categorias diferentes não se misturam", () => {
    expect(modelGroupKey("iPad", "X")).not.toBe(modelGroupKey("Celular", "X"));
  });
  it("Galaxy com caixa diferente agrupa junto", () => {
    expect(modelGroupKey("Celular", "galaxy s24")).toBe(modelGroupKey("Celular", "Galaxy S24"));
  });
});

describe("modelKey", () => {
  it("ignora acento, caixa e pontuação", () => {
    expect(modelKey("iPhone SE (3ª geração)")).toBe("iphonese3geracao");
  });
});

describe("suggestModelRenames", () => {
  const list = [
    { category: "iPhone", model: "14" },
    { category: "iPhone", model: "14" },
    { category: "iPhone", model: "16 PM" },
    { category: "iPhone", model: "iPhone 15" }, // já certo
    { category: "iPhone", model: "iphone 15 pro" },
  ];
  const r = suggestModelRenames(list);
  it("só sugere o que muda", () => {
    expect(r.map((x) => x.from).sort()).toEqual(["14", "16 PM", "iphone 15 pro"]);
  });
  it("conta quantos aparelhos cada renomeação atinge", () => {
    expect(r.find((x) => x.from === "14")).toEqual({ category: "iPhone", from: "14", to: "iPhone 14", count: 2 });
    expect(r.find((x) => x.from === "16 PM")?.to).toBe("iPhone 16 Pro Max");
  });
  it("lista vazia não sugere nada", () => {
    expect(suggestModelRenames([])).toEqual([]);
  });
});
