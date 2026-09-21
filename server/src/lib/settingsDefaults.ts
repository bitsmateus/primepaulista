// Valores padrão das configurações da loja (arquivo puro, sem imports).
// ATENÇÃO: os mesmos padrões existem no front (src/lib/storeSettings.ts e
// src/lib/warrantyTerms.ts). O teste src/test/settingsDefaults.test.ts falha se divergirem.

export interface StoreSettings {
  name: string;
  slogan: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  email: string;
  address: string;
  cnpj: string;
  pixKey: string;
}

export const DEFAULT_STORE: StoreSettings = {
  name: "Prime Paulista",
  slogan: "Sua loja no ❤️ de SP",
  whatsapp: "11 97038-3539",
  facebook: "Prime Paulista",
  instagram: "@primeavpaulista",
  email: "primeavpaulista@gmail.com",
  address: "Av. Paulista, 2064 - Ed. Paulista - 14º Andar",
  cnpj: "35.646.573/0001-71",
  pixKey: "",
};

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

export interface SecuritySettings {
  autoLockMinutes: number; // 0 = desligado
}
export const DEFAULT_SECURITY: SecuritySettings = { autoLockMinutes: 0 };
