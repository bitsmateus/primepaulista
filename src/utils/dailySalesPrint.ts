import { DailySaleRow, DailySalesReport, METHOD_LABEL, paymentText } from "@/lib/dailySales";
import { getStoreSettings } from "@/lib/storeSettings";
import { escapeHtml as esc } from "@/utils/html";

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// "2026-09-21" -> "21/09/2026"
const dateBr = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
};

function linesHtml(row: DailySaleRow): string {
  const items = row.lines
    .map((l) =>
      l.kind === "device"
        ? `<div class="item"><b>${esc(l.text)}</b><div class="serial">${l.serial ? `Nº de série: <span class="mono">${esc(l.serial)}</span>` : "Nº de série: não informado"}</div></div>`
        : `<div class="item">${esc(l.text)}</div>`
    )
    .join("");
  const trade = row.tradeIn ? `<div class="item trade">Troca: ${esc(row.tradeIn.model)} (− ${money(row.tradeIn.value)})</div>` : "";
  return items + trade;
}

function paymentsHtml(row: DailySaleRow): string {
  return row.payments.map((p) => `<div>${esc(paymentText(p))}: <b>${money(p.amount)}</b></div>`).join("");
}

function tableRows(rows: DailySaleRow[]): string {
  return rows
    .map(
      (r) => `
      <tr>
        <td class="c">${esc(r.time)}</td>
        <td>${esc(r.customer)}</td>
        <td>${esc(r.seller)}</td>
        <td>${linesHtml(r)}</td>
        <td class="r">${money(r.saleValue)}</td>
        <td>${paymentsHtml(r)}</td>
      </tr>`
    )
    .join("");
}

export function generateDailySalesHTML(report: DailySalesReport, generatedBy = ""): string {
  const store = esc(getStoreSettings().name);
  const now = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const methodRows = report.byMethod
    .map(
      (m) => `<tr class="${m.amount === 0 ? "zero" : ""}"><td>${esc(METHOD_LABEL[m.method] ?? m.method)}</td><td class="c">${m.count}</td><td class="r">${money(m.amount)}</td></tr>`
    )
    .join("");

  const returnedBlock = report.returned.length
    ? `
    <h2 class="sec">Vendas devolvidas/estornadas no dia <span>(não entram nos totais)</span></h2>
    <table>
      <thead><tr><th>Hora</th><th>Cliente</th><th>Vendedor</th><th>Produtos</th><th>Valor</th><th>Recebimento</th></tr></thead>
      <tbody>${tableRows(report.returned)}</tbody>
    </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Vendas do dia ${esc(dateBr(report.date))} – ${store}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, Arial, sans-serif; color: #111; font-size: 11px; padding: 14px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  .head h1 { font-size: 17px; }
  .head .meta { font-size: 10.5px; color: #555; text-align: right; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .sumcard { flex: 1; min-width: 110px; border: 1px solid #ccc; border-radius: 6px; padding: 6px 10px; display: flex; flex-direction: column; }
  .sumcard .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .3px; color: #777; }
  .sumcard .val { font-size: 14px; font-weight: 700; }
  h2.sec { font-size: 12.5px; margin: 16px 0 6px; }
  h2.sec span { font-weight: 400; color: #777; font-size: 10.5px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-size: 9.5px; text-transform: uppercase; letter-spacing: .3px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  td.c { text-align: center; white-space: nowrap; }
  td.r { text-align: right; font-weight: 600; white-space: nowrap; }
  .item { margin-bottom: 3px; }
  .item.trade { color: #555; font-size: 10px; }
  .serial { font-size: 10px; color: #444; }
  .mono { font-family: monospace; }
  .closing { display: flex; gap: 18px; align-items: flex-start; margin-top: 14px; break-inside: avoid; }
  .closing table { width: 320px; }
  .closing tr.zero td { color: #999; }
  .closing tr.total td { background: #111; color: #fff; font-weight: 700; }
  .closing .side { flex: 1; font-size: 10.5px; color: #333; line-height: 1.6; }
  .sign { margin-top: 34px; display: flex; gap: 30px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 3px; text-align: center; font-size: 10px; color: #555; }
  .empty { padding: 18px; text-align: center; color: #777; border: 1px dashed #ccc; border-radius: 6px; }
  .foot { margin-top: 14px; text-align: center; font-size: 10px; color: #777; }
  @page { size: A4; margin: 12mm; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="head">
    <h1>Relatório de vendas do dia — ${esc(dateBr(report.date))}</h1>
    <div class="meta">${store}<br/>gerado em ${esc(now)}${generatedBy ? ` por ${esc(generatedBy)}` : ""}</div>
  </div>

  <div class="summary">
    <div class="sumcard"><span class="lbl">Vendas</span><span class="val">${report.count}</span></div>
    <div class="sumcard"><span class="lbl">Valor vendido</span><span class="val">${money(report.totalSaleValue)}</span></div>
    <div class="sumcard"><span class="lbl">Total recebido</span><span class="val">${money(report.totalReceived)}</span></div>
  </div>

  ${
    report.rows.length
      ? `<table>
    <thead><tr><th>Hora</th><th>Cliente</th><th>Vendedor</th><th>Produtos</th><th>Valor da venda</th><th>Forma de recebimento</th></tr></thead>
    <tbody>${tableRows(report.rows)}</tbody>
  </table>`
      : `<div class="empty">Nenhuma venda registrada neste dia.</div>`
  }

  <div class="closing">
    <table>
      <thead><tr><th>Recebido por forma</th><th>Pagtos</th><th>Valor</th></tr></thead>
      <tbody>
        ${methodRows}
        <tr class="total"><td colspan="2">Total recebido</td><td class="r">${money(report.totalReceived)}</td></tr>
      </tbody>
    </table>
    <div class="side">
      <div>Valor vendido (itens − descontos): <b>${money(report.totalSaleValue)}</b></div>
      ${report.totalTradeIn > 0 ? `<div>Aparelhos recebidos na troca (abatidos): <b>${money(report.totalTradeIn)}</b></div>` : ""}
      <div>Total recebido nas formas de pagamento: <b>${money(report.totalReceived)}</b></div>
      <div>Número de vendas: <b>${report.count}</b></div>
    </div>
  </div>

  ${returnedBlock}

  <div class="sign"><div>Conferido por</div><div>Data / assinatura</div></div>
  <div class="foot">${store} · relatório de vendas do dia (uso interno)</div>
</body>
</html>`;
}

export function printDailySales(report: DailySalesReport, generatedBy = "") {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (win) {
    win.document.write(generateDailySalesHTML(report, generatedBy));
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
}
