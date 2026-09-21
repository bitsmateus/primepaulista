import defaultLogo from "@/assets/logo-prime-paulista.png";

// Dados da loja (recibo, orçamento, OS, vitrine/catálogo/relatórios). Editáveis em Configurações > Loja.
// ATENÇÃO: os padrões abaixo são espelhados em server/src/lib/settingsDefaults.ts
// (o teste src/test/settingsDefaults.test.ts falha se divergirem).

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

// Cache síncrono: as funções que montam HTML (recibo etc.) são síncronas, então leem daqui.
// É alimentado pelo React Query no carregamento do app (SettingsBootstrap) e cai nos padrões.
let current: StoreSettings = { ...DEFAULT_STORE };
let logoDataUrl = "";
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribeStoreSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getStoreSettings(): StoreSettings {
  return current;
}

// Campos vazios/ausentes caem no padrão (o nome nunca fica em branco)
export function setStoreSettings(s: Partial<StoreSettings> | null | undefined) {
  const next = { ...DEFAULT_STORE };
  if (s) {
    for (const k of Object.keys(DEFAULT_STORE) as (keyof StoreSettings)[]) {
      const v = s[k];
      if (typeof v === "string") next[k] = k === "name" && !v.trim() ? DEFAULT_STORE.name : v;
    }
  }
  current = next;
  notify();
}

export function resetStoreSettings() {
  current = { ...DEFAULT_STORE };
  logoDataUrl = "";
  notify();
}

const LOGO_OK = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export function setLogoOverride(dataUrl: string | null | undefined) {
  logoDataUrl = dataUrl && LOGO_OK.test(dataUrl) ? dataUrl : "";
  notify();
}

export function hasCustomLogo(): boolean {
  return !!logoDataUrl;
}

// Logo para telas (menu, login): a personalizada ou a padrão
export function getLogoSrc(): string {
  return logoDataUrl || defaultLogo;
}

// Logo para documentos impressos (janela nova): a padrão precisa de endereço absoluto
export function getLogoPrintUrl(): string {
  return logoDataUrl || `${window.location.origin}${defaultLogo}`;
}
