import { describe, it, expect } from "vitest";
import { parseWebhookPayload } from "../../server/src/lib/webhookParser";

// SUPOSIÇÃO: o formato real do Uazapi não pôde ser verificado (não existe instância real nos testes).
// Estes casos cobrem os formatos conhecidos (Uazapi v2, estilo Evolution/Baileys) e payloads hostis.

const uazapi = (over: Record<string, unknown> = {}, root: Record<string, unknown> = {}) => ({
  EventType: "messages",
  owner: "5511900000000",
  message: {
    chatid: "5511988887777@s.whatsapp.net",
    sender: "5511988887777@s.whatsapp.net",
    senderName: "Maria Souza",
    fromMe: false,
    isGroup: false,
    messageid: "3EB0ABC",
    messageType: "conversation",
    text: "Qual o preço do iPhone 15?",
    content: "Qual o preço do iPhone 15?",
    wasSentByApi: false,
    messageTimestamp: 1_790_000_000_000,
    ...over,
  },
  ...root,
});

describe("parser do webhook: Uazapi v2", () => {
  it("lê uma mensagem de texto", () => {
    const r = parseWebhookPayload(uazapi());
    expect(r.skipped).toBeNull();
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toMatchObject({
      id: "3EB0ABC", phone: "5511988887777", name: "Maria Souza", text: "Qual o preço do iPhone 15?",
      fromMe: false, isGroup: false, wasSentByApi: false, owner: "5511900000000", type: "conversation",
      timestamp: 1_790_000_000_000,
    });
  });
  it("mensagem própria (fromMe) e enviada pela API são marcadas", () => {
    expect(parseWebhookPayload(uazapi({ fromMe: true })).messages[0].fromMe).toBe(true);
    expect(parseWebhookPayload(uazapi({ fromMe: "true" })).messages[0].fromMe).toBe(true);
    expect(parseWebhookPayload(uazapi({ wasSentByApi: true })).messages[0].wasSentByApi).toBe(true);
  });
  it("grupo: por isGroup ou pelo sufixo @g.us", () => {
    expect(parseWebhookPayload(uazapi({ isGroup: true })).messages[0].isGroup).toBe(true);
    const g = parseWebhookPayload(uazapi({ chatid: "120363000000000000@g.us", sender: "5511988887777@s.whatsapp.net", isGroup: false }));
    expect(g.messages[0].isGroup).toBe(true);
  });
  it("status@broadcast e newsletter contam como grupo", () => {
    expect(parseWebhookPayload(uazapi({ chatid: "status@broadcast" })).messages[0].isGroup).toBe(true);
    expect(parseWebhookPayload(uazapi({ chatid: "120363@newsletter" })).messages[0].isGroup).toBe(true);
  });
  it("texto vem de text, content ou content.text", () => {
    expect(parseWebhookPayload(uazapi({ text: undefined, content: "só content" })).messages[0].text).toBe("só content");
    expect(parseWebhookPayload(uazapi({ text: undefined, content: { text: "objeto" } })).messages[0].text).toBe("objeto");
    expect(parseWebhookPayload(uazapi({ text: "", content: { caption: "legenda" }, messageType: "image" })).messages[0].text).toBe("legenda");
  });
  it("mídia sem legenda: texto vazio e tipo preservado", () => {
    const m = parseWebhookPayload(uazapi({ text: "", content: { url: "http://x" }, messageType: "image" })).messages[0];
    expect(m.text).toBe("");
    expect(m.type).toBe("image");
  });
  it("id ausente vira null", () => {
    expect(parseWebhookPayload(uazapi({ messageid: undefined })).messages[0].id).toBeNull();
  });
  it("id alternativo (id) é aceito", () => {
    expect(parseWebhookPayload(uazapi({ messageid: undefined, id: "5511900000000:ABC" })).messages[0].id).toBe("5511900000000:ABC");
  });
  it("timestamp em segundos vira milissegundos", () => {
    expect(parseWebhookPayload(uazapi({ messageTimestamp: 1_790_000_000 })).messages[0].timestamp).toBe(1_790_000_000_000);
    expect(parseWebhookPayload(uazapi({ messageTimestamp: "abc" })).messages[0].timestamp).toBeNull();
  });
  it("telefone com device (:12) e sufixo é limpo", () => {
    expect(parseWebhookPayload(uazapi({ chatid: "5511988887777:12@s.whatsapp.net" })).messages[0].phone).toBe("5511988887777");
  });
  it("id no formato @lid usa o telefone alternativo (sender_pn) ou fica sem telefone", () => {
    const lid = "123456789012345@lid";
    expect(parseWebhookPayload(uazapi({ chatid: lid, sender: lid, sender_pn: "5511977776666@s.whatsapp.net" })).messages[0].phone).toBe("5511977776666");
    expect(parseWebhookPayload(uazapi({ chatid: lid, sender: lid })).messages[0].phone).toBe("");
  });
  it("proprietário no próprio objeto da mensagem", () => {
    const m = parseWebhookPayload({ EventType: "messages", message: { chatid: "5511988887777@s.whatsapp.net", owner: "5511900000000", text: "oi" } }).messages[0];
    expect(m.owner).toBe("5511900000000");
  });
  it("eventos que não são mensagem são ignorados", () => {
    for (const ev of ["connection", "presence", "messages_update", "chats", "call"]) {
      const r = parseWebhookPayload(uazapi({}, { EventType: ev }));
      expect(r.messages).toHaveLength(0);
      expect(r.skipped).toBe("evento_ignorado");
    }
  });
  it("sem campo de evento também lê", () => {
    const { EventType: _e, ...semEvento } = uazapi();
    expect(parseWebhookPayload(semEvento).messages).toHaveLength(1);
  });
});

describe("parser do webhook: estilo Evolution/Baileys", () => {
  const evo = (over: Record<string, unknown> = {}) => ({
    event: "messages.upsert",
    instance: "loja",
    sender: "5511900000000@s.whatsapp.net", // (número da instância)
    data: {
      key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: false, id: "EVO123" },
      pushName: "João",
      messageType: "conversation",
      message: { conversation: "Tem garantia?" },
      messageTimestamp: 1_790_000_000,
      ...over,
    },
  });
  it("lê conversation", () => {
    const m = parseWebhookPayload(evo()).messages[0];
    expect(m).toMatchObject({ id: "EVO123", phone: "5511988887777", name: "João", text: "Tem garantia?", fromMe: false, isGroup: false });
  });
  it("extendedTextMessage", () => {
    const m = parseWebhookPayload(evo({ message: { extendedTextMessage: { text: "resposta longa" } } })).messages[0];
    expect(m.text).toBe("resposta longa");
  });
  it("legenda de imagem", () => {
    const m = parseWebhookPayload(evo({ message: { imageMessage: { caption: "foto do aparelho" } } })).messages[0];
    expect(m.text).toBe("foto do aparelho");
  });
  it("fromMe dentro de key", () => {
    expect(parseWebhookPayload(evo({ key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: true, id: "X" } })).messages[0].fromMe).toBe(true);
  });
  it("grupo pelo remoteJid", () => {
    expect(parseWebhookPayload(evo({ key: { remoteJid: "1203@g.us", participant: "5511988887777@s.whatsapp.net", id: "G" } })).messages[0].isGroup).toBe(true);
  });
  it("o sender da raiz (número da instância) não vira uma mensagem", () => {
    const r = parseWebhookPayload(evo());
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].phone).toBe("5511988887777");
  });
  it("lista de mensagens", () => {
    const r = parseWebhookPayload({
      event: "messages.upsert",
      data: [
        { key: { remoteJid: "5511911111111@s.whatsapp.net", id: "A" }, message: { conversation: "um" } },
        { key: { remoteJid: "5511922222222@s.whatsapp.net", id: "B" }, message: { conversation: "dois" } },
      ],
    });
    expect(r.messages.map((m) => [m.id, m.text])).toEqual([["A", "um"], ["B", "dois"]]);
  });
});

describe("parser do webhook: payloads hostis e malformados (nunca lançam)", () => {
  const junk: unknown[] = [
    null, undefined, 0, 1, true, "texto", "", [], {}, [1, 2, 3], [null], { message: null }, { message: "x" }, { message: [] },
    { data: { data: { data: { data: { chatid: "5511988887777@s.whatsapp.net", text: "profundo demais" } } } } },
    { message: { chatid: 123, text: { a: 1 }, fromMe: "talvez", messageid: {}, senderName: 5 } },
    { message: { chatid: ["5511988887777@s.whatsapp.net"], text: ["oi"] } },
    { message: { chatid: "", text: "sem chat" } },
    { message: { chatid: "@s.whatsapp.net", text: "sem número" } },
    { message: { chatid: "abc@s.whatsapp.net", text: "letras" } },
    { message: { chatid: "1@s.whatsapp.net", text: "curto" } },
    { message: { chatid: "9".repeat(40) + "@s.whatsapp.net", text: "longo demais" } },
    { EventType: 5, message: { chatid: "5511988887777@s.whatsapp.net", text: "evento numérico" } },
    { EventType: { a: 1 } },
  ];
  it.each(junk.map((j, i) => [i, j] as const))("caso %i não lança", (_i, payload) => {
    expect(() => parseWebhookPayload(payload)).not.toThrow();
    const r = parseWebhookPayload(payload);
    expect(Array.isArray(r.messages)).toBe(true);
  });
  it("payload que não é objeto é inválido", () => {
    expect(parseWebhookPayload(null).skipped).toBe("payload_invalido");
    expect(parseWebhookPayload("x").skipped).toBe("payload_invalido");
    expect(parseWebhookPayload(42).skipped).toBe("payload_invalido");
  });
  it("sem nenhum objeto de mensagem: sem_mensagem", () => {
    expect(parseWebhookPayload({}).skipped).toBe("sem_mensagem");
    expect(parseWebhookPayload({ foo: "bar" }).skipped).toBe("sem_mensagem");
  });
  it("chatid com tipo errado não gera telefone", () => {
    const r = parseWebhookPayload({ message: { chatid: "abc@s.whatsapp.net", text: "x" } });
    expect(r.messages[0].phone).toBe("");
  });
  it("texto enorme é truncado em 4000 caracteres", () => {
    const m = parseWebhookPayload(uazapi({ text: "a".repeat(50_000) })).messages[0];
    expect(m.text.length).toBe(4000);
  });
  it("no máximo 20 mensagens por chamada", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ chatid: `55119888${String(i).padStart(5, "0")}@s.whatsapp.net`, text: "oi" }));
    expect(parseWebhookPayload({ EventType: "messages", messages: many }).messages).toHaveLength(20);
  });
  it("objeto profundamente aninhado não estoura a pilha", () => {
    let o: Record<string, unknown> = { chatid: "5511988887777@s.whatsapp.net", text: "fundo" };
    for (let i = 0; i < 20_000; i++) o = { data: o };
    expect(() => parseWebhookPayload(o)).not.toThrow();
  });
  it("nomes de campo perigosos são tratados como dados", () => {
    const evil = JSON.parse('{"__proto__":{"polluted":true},"message":{"chatid":"5511988887777@s.whatsapp.net","text":"oi","constructor":"x"}}');
    const r = parseWebhookPayload(evil);
    expect(r.messages[0].text).toBe("oi");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
