import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as front from "@/lib/aiRetrieval";
import * as server from "../../server/src/lib/aiRetrieval";

// O front e o servidor usam a MESMA recuperação (BM25 em TypeScript puro): as cópias precisam ser idênticas.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("aiRetrieval: cópias do front e do servidor", () => {
  it("o arquivo é idêntico nos dois lados", () => {
    expect(read("../lib/aiRetrieval.ts")).toBe(read("../../server/src/lib/aiRetrieval.ts"));
  });
});

const doc = (id: string, title: string, content: string, over: Partial<front.KbDocument> = {}): front.KbDocument => ({
  id, title, category: "OUTRO", tags: [], content, active: true, ...over,
});

const DOCS = [
  doc("gar", "Política de garantia", "Aparelhos seminovos têm 6 meses de garantia contra defeitos de fabricação. A bateria tem 90 dias. Não cobre queda, líquidos ou mau uso.", { category: "POLITICA_GARANTIA", tags: ["garantia"] }),
  doc("pag", "Formas de pagamento", "Aceitamos PIX com 5% de desconto à vista, cartão de crédito em até 12 vezes, débito e dinheiro.", { category: "POLITICA_PAGAMENTO", tags: ["pagamento", "parcelamento"] }),
  doc("end", "Endereço e horário", "Estamos na Av. Paulista, 2064, 14º andar. Atendemos de segunda a sábado, das 9h às 19h.", { tags: ["endereço", "horário"] }),
  doc("man", "Manual de configuração do iPhone", "Para restaurar o iPhone, conecte ao computador e use o Finder. Para ativar o Face ID, abra Ajustes.", { category: "MANUAL" }),
  doc("off", "Documento inativo", "A palavra zzquimera é o código do cofre.", { active: false, tags: ["zzquimera"] }),
];

describe.each([["front", front], ["servidor", server]] as const)("aiRetrieval (%s)", (_n, m) => {
  it("normalizeText tira acento, caixa e pontuação", () => {
    expect(m.normalizeText("  GARANTIA, Bateria!! Ação  ")).toBe("garantia bateria acao");
    expect(m.normalizeText("")).toBe("");
  });

  it("estimateTokens ~ 4 caracteres por token", () => {
    expect(m.estimateTokens("")).toBe(0);
    expect(m.estimateTokens("abcd")).toBe(1);
    expect(m.estimateTokens("abcde")).toBe(2);
    expect(m.estimateTokens("x".repeat(4000))).toBe(1000);
  });

  it("consulta sobre garantia acha o documento de garantia em primeiro", () => {
    const hits = m.retrieve("Qual a garantia do iPhone seminovo?", DOCS);
    expect(hits[0].docId).toBe("gar");
    expect(hits[0].title).toBe("Política de garantia");
  });

  it("acentos e caixa não atrapalham (garantía / GARANTIA / garantia)", () => {
    for (const q of ["GARANTIA", "garantía", "garantia!!!"]) expect(m.retrieve(q, DOCS)[0].docId).toBe("gar");
    expect(m.retrieve("endereco horario", DOCS)[0].docId).toBe("end"); // sem acento acha "Endereço e horário"
    expect(m.retrieve("ENDEREÇO", DOCS)[0].docId).toBe("end");
  });

  it("sinônimos simples: parcelar/cartão -> pagamento; cobre/defeito -> garantia; onde fica -> endereço", () => {
    expect(m.retrieve("posso parcelar no cartão?", DOCS)[0].docId).toBe("pag");
    expect(m.retrieve("isso cobre defeito?", DOCS)[0].docId).toBe("gar");
    expect(m.retrieve("onde fica a loja?", DOCS)[0].docId).toBe("end");
    expect(m.retrieve("que horas vocês abrem", DOCS)[0].docId).toBe("end");
  });

  it("plural e singular casam (parcelas / parcela, defeitos / defeito)", () => {
    expect(m.retrieve("defeitos", DOCS)[0].docId).toBe("gar");
    expect(m.retrieve("qual o desconto", DOCS)[0].docId).toBe("pag");
  });

  it("consulta vazia, só de palavras vazias ou sem correspondência devolve lista vazia", () => {
    expect(m.retrieve("", DOCS)).toEqual([]);
    expect(m.retrieve("   ", DOCS)).toEqual([]);
    expect(m.retrieve("de a o para", DOCS)).toEqual([]);
    expect(m.retrieve("astronauta submarino", DOCS)).toEqual([]);
    expect(m.retrieve("garantia", [])).toEqual([]);
  });

  it("documento inativo é IGNORADO (mesmo casando por título/etiqueta)", () => {
    expect(m.retrieve("zzquimera cofre", DOCS)).toEqual([]);
    expect(m.retrieve("zzquimera", [{ ...DOCS[4], active: true }])[0].docId).toBe("off");
  });

  it("título e etiquetas reforçam o ranking", () => {
    const docs = [
      doc("a", "Assunto qualquer", "Texto que fala de bateria uma vez."),
      doc("b", "Bateria", "Outro texto sem relação."),
    ];
    expect(m.retrieve("bateria", docs)[0].docId).toBe("b"); // título
    const docs2 = [
      doc("a", "Assunto qualquer", "Texto que fala de bateria uma vez."),
      doc("c", "Outro", "Sem relação alguma.", { tags: ["bateria"] }),
    ];
    expect(m.retrieve("bateria", docs2)[0].docId).toBe("c"); // etiqueta
  });

  it("top-k limita o resultado e devolve trecho, posição e nota", () => {
    const many = Array.from({ length: 10 }, (_, i) => doc(`d${i}`, `Doc ${i}`, "garantia " + "x ".repeat(i)));
    const hits = m.retrieve("garantia", many, { k: 3 });
    expect(hits).toHaveLength(3);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
    expect(hits[0]).toMatchObject({ chunkIndex: 0 });
    expect(typeof hits[0].text).toBe("string");
  });

  it("documento longo vira trechos e o trecho certo é achado", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Parágrafo ${i}: assunto genérico número ${i} da loja.`).join("\n\n") + "\n\nA garantia da bateria é de 90 dias corridos.";
    const hits = m.retrieve("garantia da bateria", [doc("l", "Manual longo", long)]);
    expect(hits[0].text).toContain("garantia da bateria");
    expect(hits[0].chunkIndex).toBeGreaterThan(0);
  });

  it("chunkText: ~800 caracteres com sobreposição, sem perder texto e sem trechos vazios", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Frase número ${i} do documento de teste com algumas palavras.`).join(" ");
    const chunks = m.chunkText(text, 800, 120);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.length).toBeGreaterThan(0);
      expect(c.length).toBeLessThanOrEqual(800 + 130);
    }
    // sobreposição: o começo de cada trecho repete o final do anterior
    const tail = chunks[0].slice(-60).split(" ").slice(-3).join(" ");
    expect(chunks[1]).toContain(tail);
    // todas as frases aparecem em algum trecho
    for (let i = 0; i < 60; i++) expect(chunks.some((c) => c.includes(`Frase número ${i} `))).toBe(true);
    expect(m.chunkText("")).toEqual([]);
    expect(m.chunkText("curto")).toEqual(["curto"]);
  });

  it("chunkText: parágrafo gigante sem quebra é fatiado", () => {
    const one = "palavra ".repeat(500);
    const chunks = m.chunkText(one, 800, 100);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 900)).toBe(true);
  });

  it("resultado determinístico (mesma consulta, mesma ordem)", () => {
    expect(m.retrieve("garantia bateria", DOCS)).toEqual(m.retrieve("garantia bateria", DOCS));
  });
});

describe("aiRetrieval: front e servidor dão o MESMO resultado", () => {
  it("mesmas notas e ordem para várias consultas", () => {
    for (const q of ["garantia", "parcelar cartão", "onde fica", "bateria 90 dias", "iphone restaurar face id", "xyz"]) {
      expect(front.retrieve(q, DOCS)).toEqual(server.retrieve(q, DOCS));
    }
    expect(front.queryTerms("Quero trocar")).toEqual(server.queryTerms("Quero trocar"));
  });
});
