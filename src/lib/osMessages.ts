// Mensagens de WhatsApp da Assistência (modelo editável + variáveis).
// ATENÇÃO: este arquivo é ESPELHADO em src/lib/osMessages.ts (o front usa a mesma
// regra na prévia). Mantenha os dois idênticos; src/test/osMessages.test.ts roda os
// mesmos casos contra as duas cópias e falha se divergirem.
// Arquivo puro (sem imports) de propósito.

export type OsEvent = "aguardando_aprovacao" | "pronto_retirada" | "entregue";

export const OS_EVENTS: OsEvent[] = ["aguardando_aprovacao", "pronto_retirada", "entregue"];

export const OS_EVENT_LABELS: Record<OsEvent, string> = {
  aguardando_aprovacao: "Aguardando Aprovação",
  pronto_retirada: "Pronto para Retirada",
  entregue: "Entregue / Finalizado",
};

export const COST_RESPONSIBILITIES = [
  "Cliente",
  "Garantia da Loja",
  "Cortesia / Loja",
  "Dividido / Co-participação",
] as const;
export type CostResponsibility = (typeof COST_RESPONSIBILITIES)[number];

export interface OsMessagesSettings {
  templates: Record<OsEvent, string>;
  enabled: Record<OsEvent, boolean>;
  includePixKey: boolean;
  pixKey: string;
  storeName: string;
}

export const DEFAULT_OS_MESSAGES: OsMessagesSettings = {
  templates: {
    aguardando_aprovacao:
      "Olá, {primeiro_nome}! Fizemos o diagnóstico do seu {aparelho} (OS {os}). O valor do reparo é {valor}. Podemos aprovar o serviço? É só responder esta mensagem. — {loja}",
    pronto_retirada:
      "Olá, {primeiro_nome}! Seu {aparelho} (OS {os}) está pronto para retirada na {loja}. Valor: {valor}.\n\nPagamento via PIX: {chave_pix}\n\nAtendemos de segunda a sábado, das 9h às 18h.",
    entregue:
      "Olá, {primeiro_nome}! Obrigado por confiar na {loja}. A OS {os} do seu {aparelho} foi finalizada e o aparelho entregue. Guarde o recibo: ele vale como garantia do serviço. Qualquer dúvida, é só chamar!",
  },
  enabled: { aguardando_aprovacao: true, pronto_retirada: true, entregue: true },
  includePixKey: false,
  pixKey: "",
  storeName: "", // vazio = usa o nome da loja (Configurações > Loja)
};

// Campos próprios vazios usam o nome e a chave PIX cadastrados em Configurações > Loja
export function withStoreFallback(
  s: OsMessagesSettings,
  store: { name: string; pixKey: string }
): OsMessagesSettings {
  return { ...s, storeName: s.storeName.trim() || store.name.trim(), pixKey: s.pixKey.trim() || store.pixKey.trim() };
}

export const OS_VARIABLES: { key: string; description: string }[] = [
  { key: "cliente", description: "Nome completo do cliente" },
  { key: "primeiro_nome", description: "Primeiro nome do cliente" },
  { key: "os", description: "Número da OS" },
  { key: "aparelho", description: "Modelo e cor do aparelho" },
  { key: "marca", description: "Marca do aparelho" },
  { key: "modelo", description: "Modelo do aparelho" },
  { key: "imei", description: "IMEI ou serial do aparelho" },
  { key: "valor", description: "Valor a pagar (respeita quem paga o custo)" },
  { key: "loja", description: "Nome da loja" },
  { key: "chave_pix", description: "Chave PIX (some se estiver desligada ou se a OS for isenta)" },
];

export interface OsForMessage {
  id: string;
  customerName: string;
  model: string;
  color?: string | null;
  serialImei?: string | null;
  serial?: string | null;
  chargedAmount: number;
  costResponsibility?: string | null;
}

export function formatBRL(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

export function isExemptResponsibility(resp?: string | null): boolean {
  return resp === "Garantia da Loja" || resp === "Cortesia / Loja";
}

// Texto do valor para mensagens ao cliente
export function messageValueLabel(os: Pick<OsForMessage, "chargedAmount" | "costResponsibility">): string {
  if (os.costResponsibility === "Garantia da Loja") return "R$ 0,00 (isento – coberto pela garantia da loja)";
  if (os.costResponsibility === "Cortesia / Loja") return "R$ 0,00 (isento – cortesia da loja)";
  if (os.costResponsibility === "Dividido / Co-participação")
    return `${formatBRL(os.chargedAmount)} (sua parte; custo dividido com a loja)`;
  return formatBRL(os.chargedAmount);
}

export function guessBrand(model: string): string {
  const m = model.toLowerCase();
  if (/iphone|ipad|macbook|imac|airpods|apple|watch/.test(m)) return "Apple";
  if (/galaxy|samsung/.test(m)) return "Samsung";
  if (/xiaomi|redmi|poco/.test(m)) return "Xiaomi";
  if (/moto|motorola/.test(m)) return "Motorola";
  return "";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function renderOsMessage(template: string, os: OsForMessage, settings: OsMessagesSettings): string {
  const exempt = isExemptResponsibility(os.costResponsibility) || !(os.chargedAmount > 0);
  const pix = settings.includePixKey && settings.pixKey.trim() && !exempt ? settings.pixKey.trim() : "";
  const vars: Record<string, string> = {
    cliente: os.customerName.trim(),
    primeiro_nome: firstName(os.customerName),
    os: os.id.slice(0, 8).toUpperCase(),
    aparelho: `${os.model}${os.color ? ` ${os.color}` : ""}`.trim(),
    marca: guessBrand(os.model),
    modelo: os.model,
    imei: (os.serialImei || os.serial || "").trim(),
    valor: messageValueLabel(os),
    loja: settings.storeName.trim(),
    chave_pix: pix,
  };
  // Linha que só existe por causa da chave PIX some quando não há chave a mostrar
  const lines = template.split("\n").filter((l) => !(l.includes("{chave_pix}") && !pix));
  const out = lines
    .join("\n")
    .replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? vars[key] : whole));
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
