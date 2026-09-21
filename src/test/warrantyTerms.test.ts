import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_WARRANTY_TERMS, applyDaysPlaceholders, getWarrantyTerms, resetWarrantyTerms, setWarrantyTerms,
  warrantyFooterHTML, warrantyTermHTML,
} from "@/lib/warrantyTerms";
import { WARRANTY_DAYS, WARRANTY_TEXT, periodText, warrantyDaysForCondition, setWarrantyDays } from "@/lib/warranty";
import { generateReceiptHTML } from "@/utils/receiptGenerator";
import type { Sale } from "@/types/inventory";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("termos de garantia editáveis", () => {
  beforeEach(() => resetWarrantyTerms());

  it("padrões: prazos da política atual", () => {
    expect(WARRANTY_DAYS).toMatchObject({ lacrado: 365, seminovo: 180, bateria: 90, servico: 90 });
    expect(warrantyDaysForCondition("Lacrado")).toBe(365);
    expect(warrantyDaysForCondition("Seminovo")).toBe(180);
  });

  it("mudar os prazos atualiza a regra do PDV e os textos", () => {
    const t = clone(DEFAULT_WARRANTY_TERMS);
    t.days = { lacrado: 730, seminovo: 90, bateria: 30, servico: 120 };
    setWarrantyTerms(t);
    expect(warrantyDaysForCondition("Lacrado")).toBe(730);
    expect(warrantyDaysForCondition("Seminovo")).toBe(90);
    expect(WARRANTY_TEXT.servicoTitulo).toBe("Garantia de 120 dias para o serviço realizado");
    expect(WARRANTY_TEXT.seminovo).toContain("3 meses (90 dias)");
    resetWarrantyTerms();
    expect(warrantyDaysForCondition("Seminovo")).toBe(180);
  });

  it("periodText", () => {
    expect(periodText(365)).toBe("1 ano");
    expect(periodText(730)).toBe("2 anos");
    expect(periodText(180)).toBe("6 meses (180 dias)");
    expect(periodText(30)).toBe("1 mês (30 dias)");
    expect(periodText(45)).toBe("45 dias");
    expect(periodText(1)).toBe("1 dia");
  });

  it("setWarrantyDays ignora valores inválidos", () => {
    setWarrantyDays({ seminovo: -5, lacrado: Number.NaN, servico: 60.4 });
    expect(WARRANTY_DAYS.seminovo).toBe(180);
    expect(WARRANTY_DAYS.lacrado).toBe(365);
    expect(WARRANTY_DAYS.servico).toBe(60);
    setWarrantyDays({ servico: 90 });
  });

  it("placeholders {dias_*} viram os prazos", () => {
    expect(applyDaysPlaceholders("Garantia de {dias_seminovo} dias e bateria {dias_bateria}", DEFAULT_WARRANTY_TERMS.days)).toBe("Garantia de 180 dias e bateria 90");
    expect(applyDaysPlaceholders("{outro}", DEFAULT_WARRANTY_TERMS.days)).toBe("{outro}");
  });

  it("todo texto editado é escapado (sem HTML injetado)", () => {
    const t = clone(DEFAULT_WARRANTY_TERMS);
    t.title = "<script>alert(1)</script>";
    t.lead = 'Aspas " e \' e & <b>negrito</b>';
    t.bullets = ["<img src=x onerror=alert(1)>"];
    t.sections = [{ title: "<i>t</i>", text: "<a href=javascript:alert(1)>x</a>" }];
    t.footer = "linha 1 <u>\nlinha 2";
    t.agree = "<svg onload=alert(1)>";
    t.signLabel = "<marquee>";
    const html = warrantyFooterHTML(t) + warrantyTermHTML(t);
    expect(html).not.toMatch(/<script|<img|<svg|<marquee|<a href|<b>|<i>|<u>/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("linha 1 &lt;u&gt;<br/>\n    linha 2");
  });

  it("recibo usa os termos configurados", () => {
    const t = clone(DEFAULT_WARRANTY_TERMS);
    t.title = "GARANTIA DA LOJA X";
    t.bullets = ["Único tópico de {dias_seminovo} dias."];
    setWarrantyTerms(t);
    const sale = {
      id: "s", customer: { id: "c", name: "Ana", cpf: "", whatsapp: "", birthday: "", leadOrigin: "Instagram", createdAt: new Date() },
      items: [{ id: "i", type: "accessory", name: "Capa", price: 10, quantity: 1 }], payments: [], seller: "x", subtotal: 10,
      tradeInDiscount: 0, discount: 0, total: 10, giftsCost: 0, requiresInvoice: false, createdAt: new Date(),
    } as unknown as Sale;
    const html = generateReceiptHTML(sale, []);
    expect(html).toContain("<h1>GARANTIA DA LOJA X</h1>");
    expect(html).toContain("<li>Único tópico de 180 dias.</li>");
    expect(html).not.toContain("A GARANTIA DA BATERIA");
    expect(getWarrantyTerms().title).toBe("GARANTIA DA LOJA X");
  });
});
