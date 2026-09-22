import { Quote } from "@/types/quote";
import { getLogoPrintUrl, getStoreSettings } from "@/lib/storeSettings";
import { escapeHtml as h } from "@/utils/html";
import { quoteDisplayStatus } from "@/lib/quotes";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: Date) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export function generateQuoteHTML(q: Quote): string {
  const STORE = getStoreSettings();
  const logoUrl = getLogoPrintUrl();
  const expired = quoteDisplayStatus(q) === "Expirado";
  const rows = q.items
    .map(
      (i) => `
      <tr>
        <td class="c">${i.quantity}</td>
        <td>${h(i.name)}${i.serial ? `<div class="sub">IMEI/Serial: ${h(i.serial)}</div>` : ""}</td>
        <td class="r">${fmt(i.price)}</td>
        <td class="r">${fmt(i.price * i.quantity)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Orçamento nº ${q.number} – ${h(STORE.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, Arial, sans-serif; color: #111; font-size: 12px; }
  .page { max-width: 720px; margin: 0 auto; padding: 24px; }
  .head { background: #3a3a3c; color: #fff; border-radius: 8px; padding: 12px 16px; display: flex; gap: 14px; align-items: center; }
  .head img { height: 48px; width: 48px; object-fit: contain; border-radius: 50%; background: #fff; padding: 4px; }
  .head .contacts { font-size: 10px; line-height: 1.5; flex: 1; }
  .head .num { text-align: right; }
  .head .num .t { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; opacity: .8; }
  .head .num .n { font-size: 22px; font-weight: 700; }
  .addr { text-align: center; font-weight: 700; font-size: 11px; margin-top: 8px; }
  .cnpj { text-align: right; font-size: 10px; color: #444; margin-top: 2px; }
  .box { border: 1px solid #111; border-radius: 6px; padding: 8px 12px; margin-top: 10px; }
  .row { display: flex; gap: 6px; padding: 3px 0; border-bottom: 1px dotted #bbb; }
  .row:last-child { border-bottom: none; }
  .row .l { font-weight: 600; min-width: 80px; }
  .warn { margin-top: 10px; padding: 6px 10px; border: 1px solid #b45309; background: #fef3c7; color: #92400e; border-radius: 6px; font-weight: 700; text-align: center; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #111; padding: 6px 8px; font-size: 11px; }
  th { background: #f0f0f0; text-transform: uppercase; font-size: 10px; letter-spacing: .5px; }
  td.c { text-align: center; }
  td.r { text-align: right; }
  .sub { font-size: 9.5px; color: #555; margin-top: 2px; }
  .subrow td { color: #444; }
  .totrow td { font-weight: 700; font-size: 13px; }
  .terms { margin-top: 10px; font-size: 11px; }
  .terms p { margin-bottom: 4px; }
  .note { margin-top: 10px; font-size: 10px; color: #444; line-height: 1.5; border-top: 1px dashed #999; padding-top: 8px; }
  .sign { margin-top: 36px; text-align: center; }
  .sign .line { width: 60%; margin: 0 auto; border-top: 1px solid #111; padding-top: 4px; font-size: 10px; }
  @media print { .page { padding: 4px; } @page { margin: 8mm; } }
</style>
</head>
<body>
<div class="page">
  <div class="head">
    <img src="${logoUrl}" alt="${h(STORE.name)}" />
    <div class="contacts">
      <div>📱 ${h(STORE.whatsapp)}</div>
      <div>📷 ${h(STORE.instagram)}</div>
      <div>✉️ ${h(STORE.email)}</div>
    </div>
    <div class="num"><div class="t">Orçamento</div><div class="n">nº ${q.number}</div></div>
  </div>
  <div class="addr">${h(STORE.address)}</div>
  <div class="cnpj">CNPJ: ${h(STORE.cnpj)}</div>

  <div class="box">
    <div class="row"><span class="l">Data:</span><span>${fmtDate(q.createdAt)}</span></div>
    <div class="row"><span class="l">Cliente:</span><span>${h(q.customerName)}</span></div>
    ${q.customerPhone ? `<div class="row"><span class="l">Telefone:</span><span>${h(q.customerPhone)}</span></div>` : ""}
    ${q.sellerName ? `<div class="row"><span class="l">Vendedor:</span><span>${h(q.sellerName)}</span></div>` : ""}
    <div class="row"><span class="l">Válido até:</span><span>${fmtDate(q.validUntil)}</span></div>
  </div>
  ${expired ? '<div class="warn">ORÇAMENTO VENCIDO — solicite uma nova cotação</div>' : ""}

  <table>
    <thead>
      <tr><th style="width:48px">Quant.</th><th>Produto</th><th style="width:100px">Valor unit.</th><th style="width:100px">Valor total</th></tr>
    </thead>
    <tbody>
      ${rows}
      ${
        q.discount > 0
          ? `<tr class="subrow"><td colspan="3" class="r">Subtotal</td><td class="r">${fmt(q.subtotal)}</td></tr>
             <tr class="subrow"><td colspan="3" class="r">Desconto</td><td class="r">− ${fmt(q.discount)}</td></tr>`
          : ""
      }
      <tr class="totrow"><td colspan="3" class="r">TOTAL</td><td class="r">${fmt(q.total)}</td></tr>
    </tbody>
  </table>

  <div class="terms">
    ${q.paymentTerms ? `<p><b>Condições de pagamento:</b> ${h(q.paymentTerms)}</p>` : ""}
    ${q.notes ? `<p><b>Observações:</b> ${h(q.notes)}</p>` : ""}
  </div>

  <div class="note">
    Orçamento válido até ${fmtDate(q.validUntil)}. Valores sujeitos a alteração e disponibilidade de estoque.
    Aparelhos lacrados: 1 ano de garantia do fabricante. Seminovos: garantia conforme termo entregue na compra.
  </div>
  <div class="sign"><div class="line">${h(STORE.name)}</div></div>
</div>
</body>
</html>`;
}

export function printQuote(q: Quote) {
  const win = window.open("", "_blank", "width=780,height=900");
  if (win) {
    win.document.write(generateQuoteHTML(q));
    win.document.close();
    setTimeout(() => win.print(), 600);
  }
}
