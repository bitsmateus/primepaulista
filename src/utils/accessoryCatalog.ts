import { Accessory } from "@/types/inventory";
import { accessoryStockStatus } from "@/lib/accessories";
import { getStoreSettings } from "@/lib/storeSettings";
import { escapeHtml as esc } from "@/utils/html";

// Impressos do estoque de ACESSÓRIOS (capas, películas, cabos e fontes), separados dos de
// aparelhos: cada um com os seus próprios valores e totais.

const money = (v?: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const nowText = () =>
  new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const CATEGORY_ORDER = ["Capas", "Películas", "Cabos e Fontes"];

export interface AccessoryGroup {
  category: string;
  items: Accessory[];
}

// Agrupa por categoria (ordem fixa: Capas, Películas, Cabos e Fontes; outras depois) e
// ordena por subcategoria e nome dentro de cada uma.
export function groupAccessories(list: Accessory[]): AccessoryGroup[] {
  const map = new Map<string, Accessory[]>();
  for (const a of list) {
    const c = a.category || "Outros";
    if (!map.has(c)) map.set(c, []);
    map.get(c)!.push(a);
  }
  const rank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i >= 0 ? i : CATEGORY_ORDER.length;
  };
  return [...map.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], "pt-BR"))
    .map(([category, items]) => ({
      category,
      items: [...items].sort(
        (x, y) => (x.subcategory || "").localeCompare(y.subcategory || "", "pt-BR") || x.name.localeCompare(y.name, "pt-BR")
      ),
    }));
}

export interface AccessoryTotals {
  items: number; // itens distintos
  units: number; // soma das quantidades
  saleValue: number; // preço de venda x quantidade
  costValue: number; // custo x quantidade
}

export function accessoryTotals(list: Accessory[]): AccessoryTotals {
  return {
    items: list.length,
    units: list.reduce((s, a) => s + a.quantity, 0),
    saleValue: list.reduce((s, a) => s + (a.price ?? 0) * a.quantity, 0),
    costValue: list.reduce((s, a) => s + (a.cost ?? 0) * a.quantity, 0),
  };
}

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, Arial, sans-serif; color: #111; font-size: 11px; padding: 14px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  .head h1 { font-size: 18px; }
  .head .meta { font-size: 11px; color: #555; text-align: right; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  .sumcard { flex: 1; min-width: 120px; border: 1px solid #ccc; border-radius: 6px; padding: 6px 10px; display: flex; flex-direction: column; }
  .sumcard .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .3px; color: #777; }
  .sumcard .val { font-size: 14px; font-weight: 700; }
  .group { margin-bottom: 16px; }
  .grouphead { display: flex; justify-content: space-between; align-items: baseline; background: #111; color: #fff; border-radius: 6px; padding: 6px 12px; margin-bottom: 6px; }
  .grouphead h2 { font-size: 13px; }
  .grouphead .n { font-size: 11px; color: #ddd; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #f2f2f2; font-size: 10px; text-transform: uppercase; letter-spacing: .3px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  td.c { text-align: center; }
  td.r { text-align: right; }
  td.mono { font-family: monospace; font-size: 10px; }
  tr.sub td { background: #fafafa; font-weight: 700; }
  .total { border: 2px solid #111; border-radius: 6px; padding: 7px 12px; display: flex; justify-content: space-between; font-weight: 700; font-size: 12px; margin-top: 4px; }
  .low { color: #b45309; font-weight: 700; }
  .zero { color: #b91c1c; font-weight: 700; }
  .foot { margin-top: 14px; text-align: center; font-size: 10px; color: #777; }
  @page { size: A4; margin: 12mm; }
  @media print { body { padding: 0; } }
`;

const statusCell = (a: Accessory) => {
  const st = accessoryStockStatus(a);
  const cls = st === "Sem estoque" ? "zero" : st === "Estoque baixo" ? "low" : "";
  return `<span class="${cls}">${esc(st)}</span>`;
};

// ---------------------------------------------------------------------------
// Catálogo de acessórios (preço de venda, quantidade e valor em venda)
// ---------------------------------------------------------------------------
export function generateAccessoryCatalogHTML(list: Accessory[]): string {
  const store = esc(getStoreSettings().name);
  const groups = groupAccessories(list);
  const totals = accessoryTotals(list);

  const body = groups
    .map((g) => {
      const t = accessoryTotals(g.items);
      const rows = g.items
        .map(
          (a) => `
        <tr>
          <td>${esc(a.name)}<div style="font-size:9px;color:#777">${esc(a.subcategory || "")}</div></td>
          <td>${esc(a.compatibleModel || "—")}</td>
          <td class="mono">${esc(a.barcode || "—")}</td>
          <td class="c">${a.quantity}</td>
          <td class="r">${money(a.price)}</td>
          <td class="r">${money((a.price ?? 0) * a.quantity)}</td>
          <td>${statusCell(a)}</td>
        </tr>`
        )
        .join("");
      return `
      <section class="group">
        <div class="grouphead"><h2>${esc(g.category)}</h2><span class="n">${t.items} item(ns) · ${t.units} un</span></div>
        <table>
          <thead><tr><th>Produto</th><th>Modelo</th><th>Código</th><th>Qtd</th><th>Preço</th><th>Valor em venda</th><th>Status</th></tr></thead>
          <tbody>${rows}
            <tr class="sub"><td colspan="3">Subtotal — ${esc(g.category)}</td><td class="c">${t.units}</td><td></td><td class="r">${money(t.saleValue)}</td><td></td></tr>
          </tbody>
        </table>
      </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Catálogo de Acessórios – ${store}</title>
<style>${CSS}</style>
</head>
<body>
  <div class="head">
    <h1>Estoque de Acessórios — ${store}</h1>
    <div class="meta">${totals.items} item(ns) · ${totals.units} unidade(s)<br/>${nowText()}</div>
  </div>
  <div class="summary">
    <div class="sumcard"><span class="lbl">Itens</span><span class="val">${totals.items}</span></div>
    <div class="sumcard"><span class="lbl">Unidades</span><span class="val">${totals.units}</span></div>
    <div class="sumcard"><span class="lbl">Valor em venda</span><span class="val">${money(totals.saleValue)}</span></div>
  </div>
  ${body || "<p>Nenhum acessório para exibir.</p>"}
  <div class="total"><span>Total de acessórios — ${totals.units} un</span><span>${money(totals.saleValue)}</span></div>
  <div class="foot">${store} · estoque de acessórios (capas, películas, cabos e fontes)</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Relatório de conferência (custo unitário, custo total e valor em venda) — só quem vê custo
// ---------------------------------------------------------------------------
export function generateAccessoryStockReportHTML(list: Accessory[]): string {
  const store = esc(getStoreSettings().name);
  const groups = groupAccessories(list);
  const totals = accessoryTotals(list);

  const body = groups
    .map((g) => {
      const t = accessoryTotals(g.items);
      const rows = g.items
        .map(
          (a) => `
        <tr>
          <td>${esc(a.name)}<div style="font-size:9px;color:#777">${esc(a.subcategory || "")}</div></td>
          <td class="mono">${esc(a.barcode || "—")}</td>
          <td class="c">${a.quantity}</td>
          <td class="r">${money(a.cost)}</td>
          <td class="r">${money(a.cost * a.quantity)}</td>
          <td class="r">${money((a.price ?? 0) * a.quantity)}</td>
          <td>${statusCell(a)}</td>
        </tr>`
        )
        .join("");
      return `
      <section class="group">
        <div class="grouphead"><h2>${esc(g.category)}</h2><span class="n">${t.items} item(ns) · ${t.units} un · custo ${money(t.costValue)}</span></div>
        <table>
          <thead><tr><th>Produto</th><th>Código</th><th>Qtd</th><th>Custo unit.</th><th>Custo total</th><th>Valor em venda</th><th>Status</th></tr></thead>
          <tbody>${rows}
            <tr class="sub"><td colspan="2">Subtotal — ${esc(g.category)}</td><td class="c">${t.units}</td><td></td><td class="r">${money(t.costValue)}</td><td class="r">${money(t.saleValue)}</td><td></td></tr>
          </tbody>
        </table>
      </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório de Acessórios – ${store}</title>
<style>${CSS}</style>
</head>
<body>
  <div class="head">
    <h1>Relatório de Acessórios — ${store}</h1>
    <div class="meta">${totals.items} item(ns) · ${totals.units} unidade(s)<br/>${nowText()}</div>
  </div>
  <div class="summary">
    <div class="sumcard"><span class="lbl">Itens</span><span class="val">${totals.items}</span></div>
    <div class="sumcard"><span class="lbl">Unidades</span><span class="val">${totals.units}</span></div>
    <div class="sumcard"><span class="lbl">Valor em custo</span><span class="val">${money(totals.costValue)}</span></div>
    <div class="sumcard"><span class="lbl">Valor em venda</span><span class="val">${money(totals.saleValue)}</span></div>
  </div>
  ${body || "<p>Nenhum acessório para exibir.</p>"}
  <div class="total"><span>Total em custo — ${totals.units} un</span><span>${money(totals.costValue)}</span></div>
  <div class="foot">${store} · relatório de conferência de acessórios (uso interno)</div>
</body>
</html>`;
}

const openPrint = (html: string) => {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
};

export const printAccessoryCatalog = (list: Accessory[]) => openPrint(generateAccessoryCatalogHTML(list));
export const printAccessoryStockReport = (list: Accessory[]) => openPrint(generateAccessoryStockReportHTML(list));
