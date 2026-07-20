import { Device } from "@/types/inventory";
import { formatCapacity } from "@/lib/utils";
import logo from "@/assets/logo-prime-paulista.png";

// Dados da loja (cabeçalho da vitrine para o cliente)
const STORE = {
  name: "Prime Paulista",
  whatsapp: "11 97038-3539",
  instagram: "@primeavpaulista",
  address: "Av. Paulista, 2064 - Ed. Paulista - 14º Andar",
};

const money = (v?: number) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const statusColor: Record<string, string> = {
  "Disponível": "#30d158",
  "Reservado": "#0a84ff",
  "Vendido": "#8e8e93",
  "Em Manutenção": "#ff9f0a",
};

// Agrupa os aparelhos por modelo, em ordem alfabética.
function groupByModel(devices: Device[]): [string, Device[]][] {
  const groups = new Map<string, Device[]>();
  for (const d of devices) {
    const key = d.model || "Sem modelo";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  return [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((k) => [k, groups.get(k)!] as [string, Device[]]);
}

const sumPrice = (list: Device[]) => list.reduce((s, d) => s + (d.salePrice ?? 0), 0);
const sumCost = (list: Device[]) => list.reduce((s, d) => s + (d.cost ?? 0), 0);

// ---------------------------------------------------------------------------
// 1) Catálogo A4 — uso interno de controle (com preço, status e totais)
// ---------------------------------------------------------------------------
export function generateCatalogHTML(devices: Device[], isAdmin = false): string {
  const grouped = groupByModel(devices);

  const sections = grouped
    .map(([model, list]) => {
      const rows = list
        .map((d) => {
          const serial = d.serialImei || d.serial || d.internalSerial || "—";
          return `
          <tr>
            <td>${formatCapacity(d.capacity) || "—"}</td>
            <td>${d.color || "—"}</td>
            <td>${d.condition || "—"}</td>
            <td class="c">${d.batteryHealth != null ? d.batteryHealth + "%" : "—"}</td>
            <td class="mono">${serial}</td>
            <td class="r">${money(d.salePrice)}</td>
            <td><span class="dot" style="background:${statusColor[d.status] || "#8e8e93"}"></span>${d.status}</td>
          </tr>`;
        })
        .join("");
      const subtotal = `
        <tr class="subtotal">
          <td colspan="5">Subtotal — ${list.length} un</td>
          <td class="r">${money(sumPrice(list))}</td>
          <td></td>
        </tr>`;
      return `
        <div class="group">
          <h2>${model} <span class="count">${list.length} un</span></h2>
          <table>
            <thead>
              <tr><th>Capac.</th><th>Cor</th><th>Condição</th><th>Bateria</th><th>Serial/IMEI</th><th>Preço</th><th>Status</th></tr>
            </thead>
            <tbody>${rows}${subtotal}</tbody>
          </table>
        </div>`;
    })
    .join("");

  // Resumo/totais gerais
  const totalUnits = devices.length;
  const totalPrice = sumPrice(devices);
  const totalCost = sumCost(devices);
  const summaryCards = [
    { label: "Aparelhos", value: String(totalUnits) },
    { label: "Valor em venda", value: money(totalPrice) },
    ...(isAdmin
      ? [
          { label: "Valor em custo", value: money(totalCost) },
          { label: "Margem potencial", value: money(totalPrice - totalCost) },
        ]
      : []),
  ]
    .map((c) => `<div class="sumcard"><span class="lbl">${c.label}</span><span class="val">${c.value}</span></div>`)
    .join("");

  const now = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Catálogo de Estoque – Prime Paulista</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, Arial, sans-serif; color: #111; font-size: 11px; padding: 14px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  .head h1 { font-size: 18px; }
  .head .meta { font-size: 11px; color: #555; text-align: right; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  .sumcard { flex: 1; min-width: 120px; border: 1px solid #ccc; border-radius: 6px; padding: 6px 10px; display: flex; flex-direction: column; }
  .sumcard .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .3px; color: #777; }
  .sumcard .val { font-size: 14px; font-weight: 700; }
  .group { margin-bottom: 14px; break-inside: avoid; }
  h2 { font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
  .count { font-size: 10px; font-weight: 600; color: #555; background: #eee; border-radius: 10px; padding: 1px 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #f2f2f2; font-size: 10px; text-transform: uppercase; letter-spacing: .3px; }
  thead { display: table-header-group; }
  td.c { text-align: center; }
  td.r { text-align: right; font-weight: 600; }
  td.mono { font-family: monospace; font-size: 10px; }
  tr.subtotal td { background: #fafafa; font-weight: 600; font-size: 10px; color: #444; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
  .foot { margin-top: 14px; text-align: center; font-size: 10px; color: #777; }
  @page { size: A4; margin: 12mm; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="head">
    <h1>Estoque de Aparelhos — Prime Paulista</h1>
    <div class="meta">${totalUnits} aparelho(s)<br/>${now}</div>
  </div>
  <div class="summary">${summaryCards}</div>
  ${sections || "<p>Nenhum aparelho para exibir.</p>"}
  <div class="foot">Prime Paulista · documento interno de controle de estoque</div>
</body>
</html>`;
}

export function printDeviceCatalog(devices: Device[], isAdmin = false) {
  const html = generateCatalogHTML(devices, isAdmin);
  const win = window.open("", "_blank", "width=900,height=1000");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
}

// ---------------------------------------------------------------------------
// 2) Vitrine para o cliente — só disponíveis, visual, para enviar no WhatsApp
//    (sem custo, sem serial, sem margem — voltado ao cliente final)
// ---------------------------------------------------------------------------
export function generateShowcaseHTML(devices: Device[]): string {
  const available = devices.filter((d) => d.status === "Disponível");
  const grouped = groupByModel(available);

  const sections = grouped
    .map(([model, list]) => {
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
            <div class="card-model">${model}</div>
            <div class="card-specs">${specs}</div>
            <div class="card-price">${d.salePrice != null ? money(d.salePrice) : "Consulte"}</div>
          </div>`;
        })
        .join("");
      return `
        <section class="group">
          <h2>${model} <span class="count">${list.length} disponíve${list.length === 1 ? "l" : "is"}</span></h2>
          <div class="cards">${cards}</div>
        </section>`;
    })
    .join("");

  const logoUrl = `${window.location.origin}${logo}`;
  const now = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Vitrine – Prime Paulista</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, Arial, sans-serif; color: #f5f5f7; background: #1c1c1e; padding: 20px; }
  .head { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #333; padding-bottom: 14px; margin-bottom: 18px; }
  .head img { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; }
  .head h1 { font-size: 18px; }
  .head .contacts { font-size: 11px; color: #a1a1a6; margin-top: 2px; }
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
  ${sections || "<p>Nenhum aparelho disponível no momento.</p>"}
  <div class="foot">Preços válidos em ${now}, sujeitos a alteração e disponibilidade. Fale com a gente no WhatsApp ${STORE.whatsapp}.</div>
</body>
</html>`;
}

export function printDeviceShowcase(devices: Device[]) {
  const html = generateShowcaseHTML(devices);
  const win = window.open("", "_blank", "width=900,height=1000");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
}
