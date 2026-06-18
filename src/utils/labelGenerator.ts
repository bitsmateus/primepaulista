import JsBarcode from "jsbarcode";
import { formatCapacity } from "@/lib/utils";

// Gera o SVG do código de barras (CODE128) como string, para embutir no HTML de impressão.
export function barcodeSvg(value: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, value || "SEM-CODIGO", {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 38,
      width: 1.6,
    });
  } catch {
    return "";
  }
  return new XMLSerializer().serializeToString(svg);
}

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function printHtml(inner: string) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Etiqueta</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Inter', sans-serif; color: #000; padding: 6px; width: 52mm; }
    .label { border: 1px solid #000; border-radius: 4px; padding: 6px 8px; }
    .title { font-size: 13px; font-weight: 700; line-height: 1.2; }
    .row { font-size: 10px; display: flex; justify-content: space-between; gap: 8px; margin-top: 1px; }
    .row b { font-weight: 600; }
    .price { font-size: 15px; font-weight: 700; margin-top: 2px; }
    .bc { margin-top: 6px; text-align: center; }
    .bc svg { width: 100%; height: 38px; }
    .serial { font-size: 9px; text-align: center; letter-spacing: 1px; margin-top: 1px; }
    @media print { body { padding: 0; } @page { margin: 4mm; } }
  </style></head><body>${inner}
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
  </body></html>`;
  const win = window.open("", "_blank", "width=300,height=400");
  if (win) { win.document.write(html); win.document.close(); }
}

export interface DeviceLabelData {
  model: string;
  capacity: string;
  batteryHealth: number;
  color: string;
  serial: string;
}

export function printDeviceLabel(d: DeviceLabelData) {
  const code = d.serial || "";
  printHtml(`
    <div class="label">
      <div class="title">${d.model}</div>
      <div class="row"><span><b>GB:</b> ${formatCapacity(d.capacity) || "—"}</span><span><b>Cor:</b> ${d.color || "—"}</span></div>
      <div class="row"><span><b>Bateria:</b> ${d.batteryHealth ?? "—"}%</span></div>
      <div class="bc">${barcodeSvg(code)}</div>
      <div class="serial">${code || "SEM SERIAL"}</div>
    </div>`);
}

export interface AccessoryLabelData {
  name: string;
  price: number;
  barcode: string;
}

export function printAccessoryLabel(a: AccessoryLabelData) {
  printHtml(`
    <div class="label">
      <div class="title">${a.name}</div>
      <div class="price">${money(a.price || 0)}</div>
      <div class="bc">${barcodeSvg(a.barcode)}</div>
      <div class="serial">${a.barcode || "SEM CÓDIGO"}</div>
    </div>`);
}
