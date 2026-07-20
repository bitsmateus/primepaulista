import { Device } from "@/types/inventory";
import { formatCapacity } from "@/lib/utils";

const money = (v?: number) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const statusColor: Record<string, string> = {
  "Disponível": "#30d158",
  "Reservado": "#0a84ff",
  "Vendido": "#8e8e93",
  "Em Manutenção": "#ff9f0a",
};

// Catálogo A4 do estoque de aparelhos, agrupado por modelo (uso interno).
export function generateCatalogHTML(devices: Device[]): string {
  const groups = new Map<string, Device[]>();
  for (const d of devices) {
    const key = d.model || "Sem modelo";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  const models = [...groups.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const sections = models
    .map((model) => {
      const list = groups.get(model)!;
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
      return `
        <div class="group">
          <h2>${model} <span class="count">${list.length} un</span></h2>
          <table>
            <thead>
              <tr><th>Capac.</th><th>Cor</th><th>Condição</th><th>Bateria</th><th>Serial/IMEI</th><th>Preço</th><th>Status</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    })
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
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
  .foot { margin-top: 14px; text-align: center; font-size: 10px; color: #777; }
  @page { size: A4; margin: 12mm; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="head">
    <h1>Estoque de Aparelhos — Prime Paulista</h1>
    <div class="meta">${devices.length} aparelho(s)<br/>${now}</div>
  </div>
  ${sections || "<p>Nenhum aparelho para exibir.</p>"}
  <div class="foot">Prime Paulista · documento interno de controle de estoque</div>
</body>
</html>`;
}

export function printDeviceCatalog(devices: Device[]) {
  const html = generateCatalogHTML(devices);
  const win = window.open("", "_blank", "width=900,height=1000");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
}
