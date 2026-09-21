import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_STORE, getStoreSettings, setStoreSettings, resetStoreSettings, setLogoOverride, getLogoSrc, hasCustomLogo } from "@/lib/storeSettings";
import { DEFAULT_WARRANTY_TERMS } from "@/lib/warrantyTerms";
import * as serverDefaults from "../../server/src/lib/settingsDefaults";

describe("padrões: front = servidor", () => {
  it("dados da loja", () => expect(DEFAULT_STORE).toEqual(serverDefaults.DEFAULT_STORE));
  it("termos de garantia", () => expect(DEFAULT_WARRANTY_TERMS).toEqual(serverDefaults.DEFAULT_WARRANTY_TERMS));
});

describe("getStoreSettings (cache síncrono)", () => {
  beforeEach(() => resetStoreSettings());

  it("sem configuração usa os padrões", () => {
    expect(getStoreSettings()).toEqual(DEFAULT_STORE);
    expect(getStoreSettings().name).toBe("Prime Paulista");
  });
  it("aplica o que veio do servidor", () => {
    setStoreSettings({ ...DEFAULT_STORE, name: "Loja Nova", whatsapp: "11 90000-0000" });
    expect(getStoreSettings().name).toBe("Loja Nova");
    expect(getStoreSettings().whatsapp).toBe("11 90000-0000");
    expect(getStoreSettings().cnpj).toBe(DEFAULT_STORE.cnpj);
  });
  it("campos ausentes caem no padrão e o nome nunca fica em branco", () => {
    setStoreSettings({ name: "   ", slogan: "Meu slogan" });
    expect(getStoreSettings().name).toBe("Prime Paulista");
    expect(getStoreSettings().slogan).toBe("Meu slogan");
    expect(getStoreSettings().email).toBe(DEFAULT_STORE.email);
  });
  it("campo vazio é respeitado (loja sem Facebook, por exemplo)", () => {
    setStoreSettings({ ...DEFAULT_STORE, facebook: "" });
    expect(getStoreSettings().facebook).toBe("");
  });
  it("null/undefined voltam aos padrões", () => {
    setStoreSettings({ name: "X" });
    setStoreSettings(null);
    expect(getStoreSettings()).toEqual(DEFAULT_STORE);
  });
  it("logo: só aceita data URL de imagem válida", () => {
    setLogoOverride("data:image/png;base64,iVBORw0KGgo=");
    expect(hasCustomLogo()).toBe(true);
    expect(getLogoSrc()).toContain("data:image/png");
    setLogoOverride("javascript:alert(1)");
    expect(hasCustomLogo()).toBe(false);
    setLogoOverride("data:text/html;base64,PHNjcmlwdD4=");
    expect(hasCustomLogo()).toBe(false);
    setLogoOverride("");
    expect(hasCustomLogo()).toBe(false);
  });
});
