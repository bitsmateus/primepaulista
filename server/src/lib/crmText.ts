// Textos e telefones do CRM (Fase 5A): variáveis dos modelos de resposta e comparação de telefones.
//
// ATENÇÃO: este arquivo existe em DOIS lugares, com conteúdo IDÊNTICO: server/src/lib/crmText.ts e
// src/lib/crmText.ts (a API é implantada separada do site). O teste src/test/crmSync.test.ts compara
// as duas cópias e roda os mesmos casos nelas. Ao mudar, altere as DUAS. Arquivo puro (sem imports) de propósito.

export const onlyDigits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");

// Chave de comparação de telefones brasileiros: só dígitos, sem o DDI 55 e com o 9º dígito dos
// celulares antigos (10 dígitos com número começando em 6-9) já inserido. Dois telefones são o
// mesmo quando as chaves são iguais e têm pelo menos 10 dígitos.
export function phoneKey(raw: string | null | undefined): string {
  let d = onlyDigits(raw);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 && /^[6-9]/.test(d.slice(2))) d = `${d.slice(0, 2)}9${d.slice(2)}`;
  return d;
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneKey(a);
  return ka.length >= 10 && ka === phoneKey(b);
}

// Como o telefone é guardado no lead criado automaticamente: "(11) 98888-7777"
export function formatPhoneBR(raw: string | null | undefined): string {
  const d = phoneKey(raw);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return onlyDigits(raw);
}

// Sem acento e em minúsculas, para comparar nomes ("Venda Concluída" = "venda concluida")
export function foldText(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function firstName(name: string): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

// ---- Variáveis dos modelos de resposta (respostas rápidas e respostas automáticas) ----
export const REPLY_VARIABLES: { key: string; description: string }[] = [
  { key: "nome", description: "Nome completo do lead/cliente" },
  { key: "primeiro_nome", description: "Primeiro nome do lead/cliente" },
  { key: "modelo", description: "Modelo de interesse do lead (a linha some se não houver)" },
  { key: "loja", description: "Nome da loja" },
  { key: "endereco", description: "Endereço da loja (a linha some se não houver)" },
  { key: "chave_pix", description: "Chave PIX da loja (a linha some se não houver)" },
];

export interface ReplyContext {
  name?: string | null;
  model?: string | null;
  storeName?: string | null;
  address?: string | null;
  pixKey?: string | null;
}

// Sem nome conhecido, {nome} e {primeiro_nome} viram "cliente". Em modelo de VÁRIAS linhas, a linha com
// {modelo}, {endereco} ou {chave_pix} sem valor some inteira (evita "Nosso endereço: "); em modelo de uma
// linha só, a variável vazia vira texto vazio (e os espaços sobrando são arrumados). Variável desconhecida
// fica como está.
export function renderReplyTemplate(template: string, ctx: ReplyContext): string {
  const name = (ctx.name ?? "").trim();
  const vars: Record<string, string> = {
    nome: name || "cliente",
    primeiro_nome: firstName(name) || "cliente",
    modelo: (ctx.model ?? "").trim(),
    loja: (ctx.storeName ?? "").trim(),
    endereco: (ctx.address ?? "").trim(),
    chave_pix: (ctx.pixKey ?? "").trim(),
  };
  const dropWhenEmpty = ["modelo", "endereco", "chave_pix"];
  const multiline = template.includes("\n");
  const lines = multiline
    ? template.split("\n").filter((l) => !dropWhenEmpty.some((k) => l.includes(`{${k}}`) && !vars[k]))
    : [template];
  let blank = false;
  let out = lines.join("\n").replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return whole;
    if (!vars[key]) blank = true;
    return vars[key];
  });
  if (blank) out = out.replace(/[ \t]{2,}/g, " ").replace(/ +([,.;:!?])/g, "$1");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

// Modelos padrão semeados (só quando a loja ainda não tem nenhuma resposta rápida)
export const DEFAULT_QUICK_REPLIES: { title: string; category: string; body: string }[] = [
  {
    title: "Boas-vindas",
    category: "Boas-vindas",
    body: "Olá, {primeiro_nome}! Tudo bem? Aqui é da {loja}. Como posso te ajudar hoje?",
  },
  {
    title: "Endereço da loja",
    category: "Endereço",
    body: "Estamos na {endereco}.\nSerá um prazer receber você na {loja}! Atendemos de segunda a sábado, das 9h às 19h.",
  },
  {
    title: "Formas de pagamento",
    category: "Pagamento",
    body: "Aceitamos PIX, dinheiro, cartão de débito e crédito (parcelado em até 12x) e link de pagamento.\n\nPagamento via PIX: {chave_pix}",
  },
  {
    title: "Garantia",
    category: "Garantia",
    body: "Todos os aparelhos têm garantia: lacrados com 1 ano (fabricante) e seminovos com 6 meses. Você recebe o recibo com o termo de garantia na compra, {primeiro_nome}.",
  },
  {
    title: "Avaliação de troca",
    category: "Troca",
    body: "Aceitamos seu aparelho na troca, {primeiro_nome}! Me diga o modelo, a capacidade, a saúde da bateria e o estado (riscos ou trincos) para eu fazer uma avaliação.",
  },
  {
    title: "Chave PIX",
    category: "Pagamento",
    body: "Nossa chave PIX: {chave_pix}\nAssim que fizer o pagamento, me envie o comprovante, {primeiro_nome}. Obrigado!",
  },
];
