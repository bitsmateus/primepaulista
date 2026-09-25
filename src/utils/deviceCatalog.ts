import { Device } from "@/types/inventory";
import { formatCapacity } from "@/lib/utils";
import { groupDevicesByModel, splitByCondition } from "@/lib/deviceView";
import { getLogoPrintUrl, getStoreSettings } from "@/lib/storeSettings";
import { escapeHtml as esc } from "@/utils/html";

// Dados da loja (Configurações > Loja), já escapados para uso dentro do HTML
const STORE = {
  get name() { return esc(getStoreSettings().name); },
  get whatsapp() { return esc(getStoreSettings().whatsapp); },
  get instagram() { return esc(getStoreSettings().instagram); },
  get address() { return esc(getStoreSettings().address); },
};

const money = (v?: number) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const statusColor: Record<string, string> = {
  "Disponível": "#30d158",
  "Reservado": "#0a84ff",
  "Vendido": "#8e8e93",
  "Em Manutenção": "#ff9f0a",
};

// Linha em branco (sem borda) para separar visualmente aparelhos de
// capacidade/variante diferente dentro da tabela do mesmo modelo.
function spacerRow(colSpan: number): string {
  return `<tr class="spacer"><td colspan="${colSpan}"></td></tr>`;
}

const sumPrice = (list: Device[]) => list.reduce((s, d) => s + (d.salePrice ?? 0), 0);
const sumCost = (list: Device[]) => list.reduce((s, d) => s + (d.cost ?? 0), 0);

const nowText = () =>
  new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

// CSS comum dos dois documentos internos (catálogo e relatório de conferência)
const INTERNAL_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, Arial, sans-serif; color: #111; font-size: 11px; padding: 14px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  .head h1 { font-size: 18px; }
  .head .meta { font-size: 11px; color: #555; text-align: right; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  .sumcard { flex: 1; min-width: 120px; border: 1px solid #ccc; border-radius: 6px; padding: 6px 10px; display: flex; flex-direction: column; }
  .sumcard .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .3px; color: #777; }
  .sumcard .val { font-size: 14px; font-weight: 700; }
  .cond { margin-bottom: 18px; }
  .cond + .cond { break-before: page; page-break-before: always; }
  .condhead { display: flex; justify-content: space-between; align-items: baseline; background: #111; color: #fff; border-radius: 6px; padding: 7px 12px; margin-bottom: 10px; }
  .condhead h2 { font-size: 14px; }
  .condhead .n { font-size: 11px; color: #ddd; }
  .condtotal { border: 2px solid #111; border-radius: 6px; padding: 7px 12px; display: flex; justify-content: space-between; font-weight: 700; font-size: 12px; margin-top: 6px; }
  .group { margin-bottom: 14px; break-inside: avoid; }
  h3 { font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
  .count { font-size: 10px; font-weight: 600; color: #555; background: #eee; border-radius: 10px; padding: 1px 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #f2f2f2; font-size: 10px; text-transform: uppercase; letter-spacing: .3px; }
  thead { display: table-header-group; }
  td.c { text-align: center; }
  td.r { text-align: right; font-weight: 600; }
  td.mono { font-family: monospace; font-size: 10px; }
  tr.subtotal td { background: #fafafa; font-weight: 600; font-size: 10px; color: #444; }
  tr.spacer td { border: none; padding: 0; height: 10px; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
  .foot { margin-top: 14px; text-align: center; font-size: 10px; color: #777; }
  @page { size: A4; margin: 12mm; }
  @media print { body { padding: 0; } }
`;

const openPrint = (html: string, width = 900, height = 1000) => {
  const win = window.open("", "_blank", `width=${width},height=${height}`);
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
};

// ---------------------------------------------------------------------------
// 1) Catálogo A4 — uso interno de controle (com preço, status e totais).
//    Lacrados e seminovos saem em seções (e páginas) separadas, cada uma com o seu valor.
// ---------------------------------------------------------------------------
export function generateCatalogHTML(devices: Device[], showCost = false): string {
  const conditionSections = splitByCondition(devices);

  const body = conditionSections
    .map((sec) => {
      const models = groupDevicesByModel(sec.devices)
        .map(({ model, devices: list }) => {
          const rows = list
            .map((d, idx) => {
              const serial = d.serialImei || d.serial || d.internalSerial || "—";
              const spacer = idx > 0 && list[idx - 1].capacity !== d.capacity ? spacerRow(6) : "";
              return `${spacer}
          <tr>
            <td>${esc(formatCapacity(d.capacity) || "—")}</td>
            <td>${esc(d.color || "—")}</td>
            <td class="c">${d.batteryHealth != null ? d.batteryHealth + "%" : "—"}</td>
            <td class="mono">${esc(serial)}</td>
            <td class="r">${money(d.salePrice)}</td>
            <td><span class="dot" style="background:${statusColor[d.status] || "#8e8e93"}"></span>${esc(d.status)}</td>
          </tr>`;
            })
            .join("");
          return `
        <div class="group">
          <h3>${esc(model)} <span class="count">${list.length} un</span></h3>
          <table>
            <thead>
              <tr><th>Capac.</th><th>Cor</th><th>Bateria</th><th>Serial/IMEI</th><th>Preço</th><th>Status</th></tr>
            </thead>
            <tbody>${rows}
              <tr class="subtotal"><td colspan="4">Subtotal — ${list.length} un</td><td class="r">${money(sumPrice(list))}</td><td></td></tr>
            </tbody>
          </table>
        </div>`;
        })
        .join("");
      const cost = showCost ? ` · custo ${money(sumCost(sec.devices))}` : "";
      return `
      <section class="cond">
        <div class="condhead"><h2>${esc(sec.title)}</h2><span class="n">${sec.devices.length} un · venda ${money(sumPrice(sec.devices))}${cost}</span></div>
        ${models}
        <div class="condtotal"><span>Total ${esc(sec.short.toLowerCase())} — ${sec.devices.length} un</span><span>${money(sumPrice(sec.devices))}</span></div>
      </section>`;
    })
    .join("");

  const summaryCards = [
    { label: "Aparelhos", value: String(devices.length) },
    ...conditionSections.map((s) => ({ label: `${s.short} (venda)`, value: `${s.devices.length} un · ${money(sumPrice(s.devices))}` })),
    { label: "Valor em venda (total)", value: money(sumPrice(devices)) },
    ...(showCost
      ? [
          { label: "Valor em custo", value: money(sumCost(devices)) },
          { label: "Margem potencial", value: money(sumPrice(devices) - sumCost(devices)) },
        ]
      : []),
  ]
    .map((c) => `<div class="sumcard"><span class="lbl">${esc(c.label)}</span><span class="val">${esc(c.value)}</span></div>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Catálogo de Estoque – ${STORE.name}</title>
<style>${INTERNAL_CSS}</style>
</head>
<body>
  <div class="head">
    <h1>Estoque de Aparelhos — ${STORE.name}</h1>
    <div class="meta">${devices.length} aparelho(s)<br/>${nowText()}</div>
  </div>
  <div class="summary">${summaryCards}</div>
  ${body || "<p>Nenhum aparelho para exibir.</p>"}
  <div class="foot">${STORE.name} · documento interno de controle de estoque</div>
</body>
</html>`;
}

export function printDeviceCatalog(devices: Device[], showCost = false) {
  openPrint(generateCatalogHTML(devices, showCost));
}

// ---------------------------------------------------------------------------
// 1b) Relatório de estoque — conferência física (custo, serial e IMEI
//     separados). Uso interno/admin, para bater com a planilha da loja.
//     Também separado em lacrados e seminovos.
// ---------------------------------------------------------------------------
export function generateStockReportHTML(devices: Device[]): string {
  const conditionSections = splitByCondition(devices);

  const body = conditionSections
    .map((sec) => {
      const models = groupDevicesByModel(sec.devices)
        .map(({ model, devices: list }) => {
          const rows = list
            .map((d, idx) => {
              const spacer = idx > 0 && list[idx - 1].capacity !== d.capacity ? spacerRow(7) : "";
              return `${spacer}
          <tr>
            <td>${esc(formatCapacity(d.capacity) || "—")}</td>
            <td>${esc(d.color || "—")}</td>
            <td class="c">${d.batteryHealth != null ? d.batteryHealth + "%" : "—"}</td>
            <td class="mono">${esc(d.serial || d.internalSerial || "—")}</td>
            <td class="mono">${esc(d.serialImei || "—")}</td>
            <td class="r">${money(d.cost)}</td>
            <td><span class="dot" style="background:${statusColor[d.status] || "#8e8e93"}"></span>${esc(d.status)}</td>
          </tr>`;
            })
            .join("");
          return `
        <div class="group">
          <h3>${esc(model)} <span class="count">${list.length} un</span></h3>
          <table>
            <thead>
              <tr><th>Capac.</th><th>Cor</th><th>Bateria</th><th>Serial</th><th>IMEI</th><th>Custo</th><th>Status</th></tr>
            </thead>
            <tbody>${rows}
              <tr class="subtotal"><td colspan="5">Subtotal — ${list.length} un</td><td class="r">${money(sumCost(list))}</td><td></td></tr>
            </tbody>
          </table>
        </div>`;
        })
        .join("");
      return `
      <section class="cond">
        <div class="condhead"><h2>${esc(sec.title)}</h2><span class="n">${sec.devices.length} un · custo ${money(sumCost(sec.devices))}</span></div>
        ${models}
        <div class="condtotal"><span>Total ${esc(sec.short.toLowerCase())} — ${sec.devices.length} un</span><span>${money(sumCost(sec.devices))}</span></div>
      </section>`;
    })
    .join("");

  const cards = [
    `<div class="sumcard"><span class="lbl">Aparelhos</span><span class="val">${devices.length}</span></div>`,
    ...conditionSections.map(
      (s) => `<div class="sumcard"><span class="lbl">${esc(s.short)} (custo)</span><span class="val">${s.devices.length} un · ${money(sumCost(s.devices))}</span></div>`
    ),
    `<div class="sumcard"><span class="lbl">Valor em custo (total)</span><span class="val">${money(sumCost(devices))}</span></div>`,
  ].join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório de Estoque – ${STORE.name}</title>
<style>${INTERNAL_CSS}</style>
</head>
<body>
  <div class="head">
    <h1>Relatório de Estoque — ${STORE.name}</h1>
    <div class="meta">${devices.length} aparelho(s)<br/>${nowText()}</div>
  </div>
  <div class="summary">${cards}</div>
  ${body || "<p>Nenhum aparelho para exibir.</p>"}
  <div class="foot">${STORE.name} · relatório de conferência de estoque (uso interno)</div>
</body>
</html>`;
}

export function printDeviceStockReport(devices: Device[]) {
  openPrint(generateStockReportHTML(devices));
}

// ---------------------------------------------------------------------------
// 2) Vitrine para o cliente — só disponíveis, visual, para enviar no WhatsApp
//    (sem custo, sem serial, sem margem — voltado ao cliente final).
//    Novos e seminovos aparecem em blocos separados.
// ---------------------------------------------------------------------------
export function generateShowcaseHTML(devices: Device[]): string {
  const available = devices.filter((d) => d.status === "Disponível");
  const conditionSections = splitByCondition(available);

  const body = conditionSections
    .map((sec) => {
      const models = groupDevicesByModel(sec.devices)
        .map(({ model, devices: list }) => {
          const cards = list
            .map((d) => {
              const specs = [
                formatCapacity(d.capacity),
                d.color,
                d.condition,
                d.batteryHealth != null ? `Bateria ${d.batteryHealth}%` : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return `
          <div class="card">
            <div class="card-model">${esc(model)}</div>
            <div class="card-specs">${esc(specs)}</div>
            <div class="card-price">${d.salePrice != null ? money(d.salePrice) : "Consulte"}</div>
          </div>`;
            })
            .join("");
          return `
        <section class="group">
          <h2>${esc(model)} <span class="count">${list.length} disponíve${list.length === 1 ? "l" : "is"}</span></h2>
          <div class="cards">${cards}</div>
        </section>`;
        })
        .join("");
      return `<div class="block"><div class="blockhead">${esc(sec.short)}</div>${models}</div>`;
    })
    .join("");

  const logoUrl = getLogoPrintUrl();
  const now = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Vitrine – ${STORE.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, Arial, sans-serif; color: #f5f5f7; background: #1c1c1e; padding: 20px; }
  .head { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #333; padding-bottom: 14px; margin-bottom: 18px; }
  .head img { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; }
  .head h1 { font-size: 18px; }
  .head .contacts { font-size: 11px; color: #a1a1a6; margin-top: 2px; }
  .block + .block { margin-top: 26px; }
  .blockhead { display: inline-block; font-size: 13px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: #1c1c1e; background: #30d158; border-radius: 999px; padding: 4px 14px; margin-bottom: 14px; }
  .group { margin-bottom: 22px; break-inside: avoid; }
  h2 { font-size: 15px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; color: #fff; }
  .count { font-size: 10px; font-weight: 600; color: #d1d1d6; background: #2c2c2e; border-radius: 10px; padding: 2px 9px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
  .card { background: #2c2c2e; border: 1px solid #38383a; border-radius: 12px; padding: 14px; }
  .card-model { font-size: 14px; font-weight: 700; color: #fff; }
  .card-specs { font-size: 11px; color: #a1a1a6; margin-top: 4px; min-height: 28px; }
  .card-price { font-size: 18px; font-weight: 800; color: #30d158; margin-top: 8px; }
  .foot { margin-top: 20px; text-align: center; font-size: 11px; color: #8e8e93; border-top: 1px solid #333; padding-top: 12px; }
  @page { size: A4; margin: 10mm; }
  @media print {
    body { background: #1c1c1e !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="head">
    <img src="${logoUrl}" alt="${STORE.name}" />
    <div>
      <h1>${STORE.name} — Aparelhos disponíveis</h1>
      <div class="contacts">WhatsApp ${STORE.whatsapp} · ${STORE.instagram} · ${STORE.address}</div>
    </div>
  </div>
  ${body || "<p>Nenhum aparelho disponível no momento.</p>"}
  <div class="foot">Preços válidos em ${now}, sujeitos a alteração e disponibilidade. Fale com a gente no WhatsApp ${STORE.whatsapp}.</div>
</body>
</html>`;
}

export function printDeviceShowcase(devices: Device[]) {
  openPrint(generateShowcaseHTML(devices));
}
