import { Sale, Device } from "@/types/inventory";
import { escapeHtml as esc } from "@/utils/html";
import { getLogoPrintUrl, getStoreSettings } from "@/lib/storeSettings";
import { getWarrantyTerms, warrantyFooterHTML, warrantyTermHTML } from "@/lib/warrantyTerms";
import { saleDeviceLines, saleNumberLabel, tradeInModelLine } from "@/lib/sales";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function generateReceiptHTML(sale: Sale, devices: Device[]): string {
  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const store = getStoreSettings();
  const logoUrl = getLogoPrintUrl();
  const c = sale.customer;

  // Linhas de Modelo / IMEI a partir dos aparelhos da venda
  const deviceLines = saleDeviceLines(sale, devices);

  // Garantia: aparelho lacrado = só a faixa do fabricante (sem termo);
  // o termo completo sai apenas quando há aparelho seminovo na venda.
  const conditions = sale.items
    .filter((i) => i.type === "device")
    .map((i) => devices.find((d) => d.id === i.deviceId)?.condition ?? "Seminovo");
  const hasSeminovo = conditions.includes("Seminovo");
  const hasLacrado = conditions.includes("Lacrado");
  const terms = getWarrantyTerms();
  const footerHtml = hasSeminovo
    ? warrantyFooterHTML()
    : hasLacrado
      ? warrantyFooterHTML({ ...terms, footer: terms.footer.split("\n")[0] })
      : "";

  // O recibo mostra só o que o cliente leva: o aparelho de troca aparece no quadro
  // próprio e não abate o total.
  const subtotal = sale.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const receiptTotal = Math.max(0, subtotal - sale.discount);

  const itemRows = sale.items
    .map(
      (i) => `
      <tr>
        <td class="c">${i.quantity}</td>
        <td>${i.name}</td>
        <td class="r">${fmt(i.price)}</td>
        <td class="r">${fmt(i.price * i.quantity)}</td>
      </tr>`
    )
    .join("");

  const fieldRow = (label: string, value: string) =>
    `<div class="field"><span class="lbl">${label}:</span><span class="val">${value || ""}</span></div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Recibo de Venda – ${esc(store.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, Arial, sans-serif; color: #111; font-size: 12px; }
  .page { max-width: 620px; margin: 0 auto; padding: 10px; }

  /* Cabeçalho */
  .head { background: #3a3a3c; color: #fff; border-radius: 8px; padding: 6px 12px; display: flex; gap: 12px; align-items: center; }
  .head img { height: 36px; width: 36px; object-fit: contain; border-radius: 50%; background: #fff; padding: 3px; }
  .head .contacts { font-size: 9px; line-height: 1.3; }
  .head .contacts b { font-weight: 600; }
  .addr { text-align: center; font-weight: 700; font-size: 10.5px; margin-top: 4px; }
  .cnpj { text-align: right; font-size: 9.5px; color: #444; margin-top: 1px; }

  /* Campos */
  .fields { border: 1px solid #111; border-radius: 6px; padding: 3px 10px; margin-top: 4px; }
  .field { display: flex; gap: 6px; padding: 1px 0; border-bottom: 1px dotted #bbb; font-size: 10px; }
  .field:last-child { border-bottom: none; }
  .field .lbl { font-weight: 600; min-width: 56px; }
  .field .val { flex: 1; }
  .two { display: flex; gap: 16px; }
  .two .field { flex: 1; }

  /* Tabela de itens */
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #111; padding: 2px 6px; font-size: 10px; }
  th { background: #f0f0f0; text-transform: uppercase; font-size: 9px; letter-spacing: .5px; }
  td.c { text-align: center; }
  td.r { text-align: right; }
  .totrow td { font-weight: 700; font-size: 11px; }
  .subrow td { color: #444; }

  /* Rodapé garantia (frente) */
  .warranty-foot { border: 1px solid #111; border-radius: 6px; margin-top: 4px; padding: 3px; text-align: center; font-weight: 700; font-size: 10px; line-height: 1.25; }

  /* Termo (mesma folha, abaixo do recibo) */
  .term { margin-top: 4px; padding-top: 4px; border-top: 1px dashed #999; page-break-inside: avoid; }
  .term h1 { text-align: center; font-size: 12px; margin-bottom: 3px; }
  .term p { font-size: 8.5px; line-height: 1.2; margin-bottom: 2px; text-align: justify; }
  .term .lead { font-weight: 700; }
  .term ul { margin: 0 0 3px 14px; }
  .term li { font-size: 8.5px; line-height: 1.2; margin-bottom: 1px; text-align: justify; }
  .term .sec { font-weight: 700; margin-top: 3px; }
  .sign { margin-top: 8px; text-align: center; }
  .sign .agree { font-weight: 600; margin-bottom: 6px; }
  .sign .line { width: 70%; margin: 0 auto; border-top: 1px solid #111; padding-top: 3px; font-size: 8.5px; }

  @media print { .page { padding: 0; } @page { margin: 5mm; } }
</style>
</head>
<body>

<!-- ===== RECIBO (+ termo de garantia só para seminovo), em 1 única folha ===== -->
<div class="page">
  <div class="head">
    <img src="${logoUrl}" alt="${esc(store.name)}" />
    <div class="contacts">
      <div>📱 ${esc(store.whatsapp)}</div>
      <div>📘 ${esc(store.facebook)}</div>
      <div>📷 ${esc(store.instagram)}</div>
      <div>✉️ ${esc(store.email)}</div>
    </div>
  </div>
  <div class="addr">${esc(store.address)}</div>
  <div class="cnpj">CNPJ: ${esc(store.cnpj)}</div>

  <div class="fields">
    <div class="two">
      ${sale.saleNumber != null ? fieldRow("Venda", saleNumberLabel(sale.saleNumber)) : ""}
      ${fieldRow("Data", formatDate(sale.createdAt))}
    </div>
    ${fieldRow("Cliente", c?.name ?? "")}
    <div class="two">
      ${fieldRow("CPF", c?.cpf ?? "")}
      ${fieldRow("Telefone", c?.whatsapp ?? "")}
    </div>
    ${deviceLines
      .map(
        (d) => `
      ${fieldRow("Modelo", d.modelo)}
      <div class="two">
        ${d.imei1 ? fieldRow("IMEI 1", d.imei1) : ""}
        ${d.imei2 ? fieldRow("IMEI 2", d.imei2) : ""}
      </div>
      ${d.serial ? fieldRow("Serial", d.serial) : ""}`
      )
      .join("")}
  </div>

  ${
    sale.tradeIn
      ? `
  <div class="fields">
    <div class="field"><span class="lbl" style="min-width:100%">Aparelho recebido como parte de pagamento:</span></div>
    <div class="two">
      ${fieldRow("Modelo", esc(tradeInModelLine(sale.tradeIn)))}
      ${fieldRow("Entrou por", fmt(sale.tradeIn.value))}
    </div>
    <div class="two">
      ${sale.tradeIn.serial ? fieldRow("Serial", esc(sale.tradeIn.serial)) : ""}
      ${sale.tradeIn.imei ? fieldRow("IMEI", esc(sale.tradeIn.imei)) : ""}
    </div>
  </div>`
      : ""
  }

  <table>
    <thead>
      <tr><th style="width:48px">Quant.</th><th>Discriminação</th><th style="width:90px">Preço Unit.</th><th style="width:90px">Preço Total</th></tr>
    </thead>
    <tbody>
      ${itemRows}
      ${
        sale.discount !== 0
          ? `<tr class="subrow"><td colspan="3" class="r">${sale.discount > 0 ? "Desconto" : "Acréscimo"}</td><td class="r">${sale.discount > 0 ? "− " : "+ "}${fmt(Math.abs(sale.discount))}</td></tr>`
          : ""
      }
      <tr class="totrow"><td colspan="3" class="r">TOTAL</td><td class="r">${fmt(receiptTotal)}</td></tr>
    </tbody>
  </table>

  ${footerHtml ? `<div class="warranty-foot">
    ${footerHtml}
  </div>` : ""}

  ${hasSeminovo ? `<!-- ===== TERMO DE GARANTIA (mesma folha) ===== -->
  <div class="term">
  ${warrantyTermHTML()}
  </div>` : ""}
</div>

</body>
</html>`;
}

export function printReceipt(sale: Sale, devices: Device[]) {
  const html = generateReceiptHTML(sale, devices);
  const win = window.open("", "_blank", "width=720,height=900");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }
}
