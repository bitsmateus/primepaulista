import { setWarrantyDays } from "@/lib/warranty";
import { escapeHtml } from "@/utils/html";

// Prazos e texto do termo de garantia (Configurações > Termos de garantia).
// ATENÇÃO: os padrões são espelhados em server/src/lib/settingsDefaults.ts
// (o teste src/test/settingsDefaults.test.ts falha se divergirem).
// Com os padrões o recibo sai IDÊNTICO ao de antes (src/test/receiptDefaults.test.ts).

export interface WarrantyTerms {
  days: { lacrado: number; seminovo: number; bateria: number; servico: number };
  footer: string; // faixa abaixo dos itens (linhas separadas por \n)
  title: string;
  lead: string;
  bullets: string[];
  sections: { title: string; text: string }[];
  agree: string;
  signLabel: string;
}

export const DEFAULT_WARRANTY_TERMS: WarrantyTerms = {
  days: { lacrado: 365, seminovo: 180, bateria: 90, servico: 90 },
  footer:
    "APARELHO LACRADO 1 ANO DE GARANTIA PELO FABRICANTE\nAPARELHO SEMI NOVOS GARANTIA VIDE TERMO ABAIXO",
  title: "TERMO DE GARANTIA",
  lead: "A garantia do aparelho é de 6 MESES ou 180 (CENTO E OITENTA) dias, a partir da data de compra; sendo:",
  bullets: [
    "A garantia sobre o aparelho é de 6 meses contra eventuais defeitos de fabricação, defeitos esses não provocados por mau uso do mesmo.",
    "A GARANTIA DA BATERIA É DE 90 (NOVENTA) dias e está de acordo com o artigo 26, inciso II, do Código de Defesa do Consumidor.",
    "Funcionamento, instalação e atualização de aplicativos, bem como o sistema operacional do aparelho, NÃO FAZEM parte desta garantia.",
    "Limpeza e conservação do aparelho NÃO FAZEM parte desta garantia.",
    "A não apresentação deste documento (recibo/termo de garantia) que comprove a compra INVALIDA a garantia.",
    "Qualquer mau funcionamento APÓS ATUALIZAÇÕES do sistema operacional ou aplicativos NÃO FAZ PARTE DESSA GARANTIA.",
    "A GARANTIA é válida somente para o item descrito no recibo.",
  ],
  sections: [
    {
      title: "NÃO ESTÃO INCLUSOS NESTA GARANTIA ACESSÓRIOS E TODAS AS PARTES EXTERNAS DO CELULAR, TAIS COMO:",
      text: "Lentes, carcaças, capas, cases, botões laterais, tampas, películas protetoras, fones de ouvido e partes que se desgastam com o uso.",
    },
    {
      title: "A GARANTIA É CANCELADA NOS SEGUINTES CASOS:",
      text: "Em ocasião de quedas, esmagamentos, sobrecarga elétrica; exposição do aparelho a altas temperaturas, umidade ou líquidos; exposição do aparelho a poeira, pó e/ou limalha de metais; ou ainda quando constatado mau uso do aparelho, instalações, modificações ou atualizações no seu sistema operacional; rompimento do lacre/selo colocado pela Prime Paulista; e abertura do equipamento ou tentativa de conserto deste por terceiros que não sejam os técnicos da Prime Paulista, mesmo que para realização de outros serviços.",
    },
  ],
  agree: "Li e concordo com os termos descritos acima.",
  signLabel: "ASSINATURA DO CLIENTE",
};

let current: WarrantyTerms = clone(DEFAULT_WARRANTY_TERMS);

function clone(t: WarrantyTerms): WarrantyTerms {
  return JSON.parse(JSON.stringify(t)) as WarrantyTerms;
}

// Cache síncrono (mesmo padrão de getStoreSettings). Também atualiza os prazos usados no PDV/OS.
export function setWarrantyTerms(t: WarrantyTerms | null | undefined) {
  current = t ? clone(t) : clone(DEFAULT_WARRANTY_TERMS);
  setWarrantyDays(current.days);
}

export function resetWarrantyTerms() {
  setWarrantyTerms(null);
}

export function getWarrantyTerms(): WarrantyTerms {
  return current;
}

// {dias_lacrado} {dias_seminovo} {dias_bateria} {dias_servico} viram os prazos configurados
export function applyDaysPlaceholders(text: string, days: WarrantyTerms["days"]): string {
  return text.replace(/\{dias_(lacrado|seminovo|bateria|servico)\}/g, (_m, k: keyof WarrantyTerms["days"]) => String(days[k]));
}

// Bloco HTML do termo de garantia do recibo de venda (texto editável, sempre escapado).
export function warrantyFooterHTML(t: WarrantyTerms = current): string {
  return t.footer
    .split("\n")
    .map((l) => escapeHtml(applyDaysPlaceholders(l, t.days)))
    .join("<br/>\n    ");
}

export function warrantyTermHTML(t: WarrantyTerms = current): string {
  const d = (s: string) => escapeHtml(applyDaysPlaceholders(s, t.days));
  const bullets = t.bullets.length
    ? `<ul>\n${t.bullets.map((b) => `    <li>${d(b)}</li>`).join("\n")}\n  </ul>`
    : "";
  const sections = t.sections
    .map((s) => `${s.title ? `  <p class="sec">${d(s.title)}</p>\n` : ""}  <p>${d(s.text)}</p>`)
    .join("\n");
  return `<h1>${d(t.title)}</h1>
  <p class="lead">${d(t.lead)}</p>
  ${bullets}
${sections}
  <div class="sign">
    <p class="agree">${d(t.agree)}</p>
    <div class="line">${d(t.signLabel)}</div>
  </div>`;
}
