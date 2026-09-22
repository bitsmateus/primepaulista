import { describe, it, expect } from "vitest";
import { encryptWith, decryptWith, deriveKey } from "../../server/src/lib/crypto";
import { increasedCounts, notificationMessage, loadLastCounts, saveLastCounts, loadPrefs, savePrefs, DEFAULT_PREFS } from "@/lib/notifications";
import { formatDocument, isValidDocument, findSupplierByName, newSupplierNames, normSupplierName } from "@/lib/suppliers";
import { validateLogoFile, fitWithin } from "@/lib/image";
import { extractSettingsFromBackup } from "@/lib/backup";
import { actionLabel, actionTone, entityLabel } from "@/lib/audit";

describe("cifra AES-256-GCM das variáveis customizadas", () => {
  it("cifra e decifra (ida e volta)", () => {
    for (const v of ["abc123", "sk-proj-ÁÉÍ 中文 🔑", "a".repeat(4000), ""]) {
      const enc = encryptWith("segredo-de-teste-1234", v);
      expect(decryptWith("segredo-de-teste-1234", enc)).toBe(v);
    }
  });
  it("o texto cifrado não contém o valor e muda a cada vez (IV aleatório)", () => {
    const a = encryptWith("k", "MEU_SEGREDO");
    const b = encryptWith("k", "MEU_SEGREDO");
    expect(a).not.toContain("MEU_SEGREDO");
    expect(Buffer.from(a.split(":")[3], "base64").toString("utf8")).not.toContain("MEU_SEGREDO");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
  });
  it("chave errada ou dado adulterado falham", () => {
    const enc = encryptWith("chave-certa", "valor");
    expect(() => decryptWith("chave-errada", enc)).toThrow();
    const parts = enc.split(":");
    const tampered = [parts[0], parts[1], parts[2], Buffer.from("outra coisa").toString("base64")].join(":");
    expect(() => decryptWith("chave-certa", tampered)).toThrow();
    expect(() => decryptWith("chave-certa", "lixo")).toThrow();
  });
  it("a chave derivada tem 32 bytes e depende do segredo", () => {
    expect(deriveKey("a").length).toBe(32);
    expect(deriveKey("a").equals(deriveKey("b"))).toBe(false);
    expect(deriveKey("a").equals(deriveKey("a"))).toBe(true);
  });
});

describe("notificações: só quando aumenta", () => {
  const base = { osReady: 1, tasksDue: 0, quotesToday: 2, lowStock: 3, staleDevices: 4 };

  it("primeira carga (sem último visto) não notifica", () => {
    expect(increasedCounts(null, base)).toEqual([]);
  });
  it("mesmo total não repete", () => {
    expect(increasedCounts(base, { ...base })).toEqual([]);
  });
  it("diminuir não notifica", () => {
    expect(increasedCounts(base, { ...base, lowStock: 1, osReady: 0 })).toEqual([]);
  });
  it("aumentar notifica só o que subiu", () => {
    const r = increasedCounts(base, { ...base, osReady: 3, staleDevices: 5 });
    expect(r).toEqual([
      { key: "osReady", from: 1, to: 3 },
      { key: "staleDevices", from: 4, to: 5 },
    ]);
  });
  it("chave ausente vale 0 (cargo sem aquele contador)", () => {
    expect(increasedCounts({ lowStock: 2 }, { lowStock: 2 })).toEqual([]);
    expect(increasedCounts({}, { lowStock: 1 })).toEqual([{ key: "lowStock", from: 0, to: 1 }]);
  });
  it("mensagem legível no singular e no plural", () => {
    const one = notificationMessage([{ key: "osReady", from: 0, to: 1 }]);
    expect(one.title).toBe("Novo aviso");
    expect(one.body).toContain("1 OS pronta para retirada");
    const two = notificationMessage([{ key: "osReady", from: 0, to: 2 }, { key: "quotesToday", from: 0, to: 1 }]);
    expect(two.title).toBe("2 novos avisos");
    expect(two.body).toContain("2 OS prontas");
    expect(two.body).toContain("1 orçamento vence hoje");
  });
  it("preferências e último visto ficam por usuário no localStorage", () => {
    localStorage.clear();
    expect(loadPrefs("u1")).toEqual(DEFAULT_PREFS);
    savePrefs("u1", { enabled: false, sound: true });
    expect(loadPrefs("u1")).toEqual({ enabled: false, sound: true });
    expect(loadPrefs("u2")).toEqual(DEFAULT_PREFS);
    expect(loadLastCounts("u1")).toBeNull();
    saveLastCounts("u1", { osReady: 2 });
    expect(loadLastCounts("u1")).toEqual({ osReady: 2 });
    expect(loadLastCounts("u2")).toBeNull();
    localStorage.setItem("pp_notif_prefs_u3", "{quebrado");
    expect(loadPrefs("u3")).toEqual(DEFAULT_PREFS);
  });
});

describe("fornecedores (regras puras)", () => {
  it("formata CPF e CNPJ", () => {
    expect(formatDocument("12345678901")).toBe("123.456.789-01");
    expect(formatDocument("35646573000171")).toBe("35.646.573/0001-71");
    expect(formatDocument("123")).toBe("123");
    expect(formatDocument("")).toBe("");
  });
  it("valida tamanho do documento (opcional)", () => {
    expect(isValidDocument("")).toBe(true);
    expect(isValidDocument("123.456.789-01")).toBe(true);
    expect(isValidDocument("35.646.573/0001-71")).toBe(true);
    expect(isValidDocument("12345")).toBe(false);
  });
  it("casa pelo nome sem diferenciar maiúsculas nem espaços extras", () => {
    const list = [{ name: "Atacado SP", id: 1 }, { name: "Import Tech", id: 2 }];
    expect(findSupplierByName(list, "  atacado   sp ")?.id).toBe(1);
    expect(findSupplierByName(list, "IMPORT TECH")?.id).toBe(2);
    expect(findSupplierByName(list, "Outro")).toBeUndefined();
    expect(findSupplierByName(list, "  ")).toBeUndefined();
    expect(normSupplierName(" A  B ")).toBe("a b");
  });
  it("nomes novos de um arquivo (sem repetir os existentes nem entre si)", () => {
    const existing = [{ name: "Atacado SP" }];
    expect(newSupplierNames(["atacado sp", "Nova Loja", "nova  loja", "", "Outra"], existing)).toEqual(["Nova Loja", "Outra"]);
  });
});

describe("logo", () => {
  it("valida tipo e tamanho", () => {
    expect(validateLogoFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateLogoFile({ type: "image/jpeg", size: 2 * 1024 * 1024 })).toBeNull();
    expect(validateLogoFile({ type: "image/webp", size: 10 })).toBeNull();
    expect(validateLogoFile({ type: "image/gif", size: 10 })).not.toBeNull();
    expect(validateLogoFile({ type: "image/svg+xml", size: 10 })).not.toBeNull();
    expect(validateLogoFile({ type: "image/png", size: 2 * 1024 * 1024 + 1 })).toMatch(/2 MB/);
    expect(validateLogoFile({ type: "image/png", size: 0 })).not.toBeNull();
  });
  it("reduz para no máximo 512 px mantendo a proporção e sem ampliar", () => {
    expect(fitWithin(2048, 1024)).toEqual({ width: 512, height: 256 });
    expect(fitWithin(1000, 4000)).toEqual({ width: 128, height: 512 });
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(0, 10)).toEqual({ width: 1, height: 1 });
  });
});

describe("arquivo de backup (restaurar configurações)", () => {
  it("lê { settings }", () => {
    expect(extractSettingsFromBackup({ settings: { store: { name: "X" } }, tables: {} })).toEqual({ store: { name: "X" } });
  });
  it("lê tables.appSettings", () => {
    expect(extractSettingsFromBackup({ tables: { appSettings: [{ key: "logo", value: { dataUrl: "" } }] } })).toEqual({ logo: { dataUrl: "" } });
  });
  it("lê arquivo simples chave -> valor", () => {
    expect(extractSettingsFromBackup({ store: { name: "X" } })).toEqual({ store: { name: "X" } });
  });
  it("recusa lixo e backup sem configurações", () => {
    expect(extractSettingsFromBackup(null)).toBeNull();
    expect(extractSettingsFromBackup([1, 2])).toBeNull();
    expect(extractSettingsFromBackup("x")).toBeNull();
    expect(extractSettingsFromBackup({ version: 1 })).toBeNull();
  });
});

describe("auditoria: textos", () => {
  it("ação e entidade legíveis, com fallback", () => {
    expect(actionLabel("sale.return")).toBe("Devolveu venda");
    expect(actionLabel("coisa.nova")).toBe("coisa.nova");
    expect(entityLabel("device")).toBe("Aparelho");
    expect(entityLabel("xyz")).toBe("xyz");
  });
  it("tom visual das ações sensíveis", () => {
    expect(actionTone("auth.login_failed")).toBe("danger");
    expect(actionTone("device.delete")).toBe("danger");
    expect(actionTone("device.price_change")).toBe("warn");
    expect(actionTone("custom_var.reveal")).toBe("warn");
    expect(actionTone("auth.login")).toBe("neutral");
  });
});
