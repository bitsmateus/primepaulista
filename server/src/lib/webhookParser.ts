// Leitura TOLERANTE do payload de mensagem recebida que o Uazapi envia ao webhook (Fase 5A).
//
// SUPOSIÇÃO (não verificada contra um Uazapi real, que não existe no ambiente de testes): o payload
// segue um destes formatos conhecidos, e o parser aceita variações de nomes de campo:
//   1) Uazapi v2:   { EventType: "messages", owner: "5511...", message: { chatid: "5511...@s.whatsapp.net",
//                     sender, senderName, fromMe, isGroup, messageid, messageType, text, content, wasSentByApi,
//                     messageTimestamp } }
//   2) estilo Evolution/Baileys: { event: "messages.upsert", data: { key: { remoteJid, fromMe, id },
//                     pushName, message: { conversation | extendedTextMessage: { text } } } }
//   3) o mesmo com uma lista de mensagens (message[] / messages[] / data[]).
// Campos ausentes ou de tipo errado NUNCA lançam erro: a mensagem só é descartada com um motivo.
// Arquivo puro (sem imports) de propósito.

export interface InboundMessage {
  id: string | null; // id da mensagem no provedor (idempotência)
  phone: string; // só dígitos (com DDI, como veio)
  name: string; // nome do contato (pushName), pode ser vazio
  text: string; // texto/legenda ("" se for mídia sem legenda)
  type: string; // tipo informado pelo provedor (ex.: "conversation", "image")
  fromMe: boolean;
  isGroup: boolean;
  wasSentByApi: boolean;
  owner: string; // número da própria instância (só dígitos), se informado
  timestamp: number | null; // epoch em ms, se informado
}

export interface ParsedWebhook {
  messages: InboundMessage[];
  // Por que nada foi lido (payload inválido, evento que não é mensagem...). null quando há mensagens.
  skipped: string | null;
}

const MAX_TEXT = 4000;
const MAX_MESSAGES = 20;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const bool = (v: unknown): boolean => v === true || v === "true" || v === 1 || v === "1";
const digits = (s: string) => s.replace(/\D/g, "");

// Primeira string não vazia entre os caminhos ("a.b" = obj.a.b)
function pick(obj: Record<string, unknown>, paths: string[], max = 300): string {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const k of path.split(".")) cur = isObj(cur) ? cur[k] : undefined;
    const s = str(cur, max);
    if (s.trim()) return s;
  }
  return "";
}

const CONTAINERS = ["data", "body", "payload", "message", "messages", "msg", "event"];

function looksLikeMessage(o: Record<string, unknown>): boolean {
  return Boolean(
    pick(o, ["chatid", "chatId", "chat_id", "remoteJid", "jid", "from", "key.remoteJid"])
  );
}

// Percorre o payload (até 3 níveis) juntando os objetos que parecem ser uma mensagem
function findMessageObjects(root: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const visit = (node: unknown, depth: number) => {
    if (found.length >= MAX_MESSAGES || depth > 3) return;
    if (Array.isArray(node)) {
      for (const it of node.slice(0, MAX_MESSAGES)) visit(it, depth + 1);
      return;
    }
    if (!isObj(node)) return;
    if (looksLikeMessage(node)) {
      found.push(node);
      return; // não desce dentro da mensagem
    }
    for (const k of CONTAINERS) if (k in node) visit(node[k], depth + 1);
  };
  visit(root, 0);
  return found;
}

function extractText(o: Record<string, unknown>): string {
  return pick(
    o,
    [
      "text",
      "content.text",
      "content.caption",
      "caption",
      "body",
      "message.conversation",
      "message.extendedTextMessage.text",
      "message.imageMessage.caption",
      "message.videoMessage.caption",
      "content",
    ],
    MAX_TEXT
  ).trim();
}

function extractPhone(o: Record<string, unknown>): { phone: string; isGroup: boolean } {
  const chat = pick(o, ["chatid", "chatId", "chat_id", "remoteJid", "key.remoteJid", "jid", "from"]);
  const sender = pick(o, ["sender", "key.participant"]);
  const senderPn = pick(o, ["sender_pn", "senderPn", "key.senderPn", "key.remoteJidAlt"]);
  const isGroup = bool(o.isGroup) || /@g\.us$/i.test(chat) || /@g\.us$/i.test(sender) || /@newsletter$/i.test(chat) || /^status@broadcast$/i.test(chat);
  const candidates = [chat, senderPn, sender].filter(Boolean);
  for (const c of candidates) {
    // ids no formato @lid não são telefones
    if (/@lid$/i.test(c)) continue;
    const d = digits(c.split("@")[0].split(":")[0]);
    if (d.length >= 8 && d.length <= 15) return { phone: d, isGroup };
  }
  return { phone: "", isGroup };
}

export function parseWebhookPayload(payload: unknown): ParsedWebhook {
  if (!isObj(payload) && !Array.isArray(payload)) return { messages: [], skipped: "payload_invalido" };

  // Eventos que não são mensagem nova (conexão, presença, atualização de status...) são ignorados
  if (isObj(payload)) {
    const ev = pick(payload, ["EventType", "eventType", "event", "type"]).toLowerCase();
    if (ev && (!/messag/.test(ev) || /update|ack|status|delete|reaction/.test(ev))) {
      return { messages: [], skipped: "evento_ignorado" };
    }
  }

  const objs = findMessageObjects(payload);
  if (objs.length === 0) return { messages: [], skipped: "sem_mensagem" };

  const rootOwner = isObj(payload) ? digits(pick(payload, ["owner", "instanceOwner", "ownerNumber", "instance.owner"])) : "";
  const messages: InboundMessage[] = [];
  for (const o of objs) {
    const { phone, isGroup } = extractPhone(o);
    const ts = Number(isObj(o) ? (o.messageTimestamp ?? o.timestamp ?? o.t) : NaN);
    messages.push({
      id: pick(o, ["messageid", "messageId", "message_id", "key.id", "id"], 200) || null,
      phone,
      name: pick(o, ["senderName", "pushName", "notifyName", "contactName", "name"], 120).trim(),
      text: extractText(o),
      type: pick(o, ["messageType", "type"], 60),
      fromMe: bool(o.fromMe) || bool((o.key as Record<string, unknown> | undefined)?.fromMe),
      isGroup,
      wasSentByApi: bool(o.wasSentByApi),
      owner: digits(pick(o, ["owner"])) || rootOwner,
      timestamp: Number.isFinite(ts) && ts > 0 ? (ts < 1e12 ? ts * 1000 : ts) : null,
    });
  }
  return { messages, skipped: null };
}
