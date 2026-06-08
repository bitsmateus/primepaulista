import { Sale, Device } from "@/types/inventory";
import { formatCapacity } from "@/lib/utils";

export function generateReceiptHTML(sale: Sale, devices: Device[]): string {
  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const deviceItems = sale.items.filter((i) => i.type === "device");
  const accessoryItems = sale.items.filter((i) => i.type === "accessory");

  const warrantyBlocks = deviceItems
    .map((item) => {
      const device = devices.find((d) => d.id === item.deviceId);
      if (!device) return "";
      const isNew = device.condition === "Lacrado";
      return `
        <div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-top:8px;">
          <p style="font-weight:600;margin:0 0 4px;">${device.model} – ${formatCapacity(device.capacity)} ${device.color}</p>
          <p style="margin:0;font-size:12px;">Serial/IMEI: ${device.serialImei || device.internalSerial}</p>
          <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:${isNew ? "#0a84ff" : "#30d158"};">
            ${isNew ? "Garantia oficial Apple de 1 ano" : "Garantia NX Apple de 90 dias contra defeitos de fabricação"}
          </p>
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Recibo – ${sale.id.slice(0, 8)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; color: #1c1c1e; padding: 32px; max-width: 380px; margin: auto; font-size: 13px; }
    .header { text-align: center; border-bottom: 2px solid #1c1c1e; padding-bottom: 16px; margin-bottom: 16px; }
    .header h1 { font-size: 18px; font-weight: 700; }
    .header p { font-size: 11px; color: #6e6e73; margin-top: 2px; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6e6e73; margin-bottom: 8px; font-weight: 600; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; }
    .row.total { font-weight: 700; font-size: 16px; border-top: 2px solid #1c1c1e; padding-top: 8px; margin-top: 8px; }
    .items-table { width: 100%; border-collapse: collapse; }
    .items-table th, .items-table td { text-align: left; padding: 4px 0; font-size: 12px; }
    .items-table th { border-bottom: 1px solid #ddd; font-weight: 600; }
    .items-table td:last-child, .items-table th:last-child { text-align: right; }
    .footer { text-align: center; margin-top: 24px; font-size: 10px; color: #6e6e73; border-top: 1px dashed #ccc; padding-top: 12px; }
    @media print { body { padding: 8px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Prime Paulista</h1>
    <p>Sua Loja no ❤️ de SP</p>
    <p style="margin-top:8px;font-size:12px;">RECIBO DE VENDA</p>
  </div>

  <div class="section">
    <div class="section-title">Dados da Venda</div>
    <div class="row"><span>Nº</span><span>${sale.id.slice(0, 8).toUpperCase()}</span></div>
    <div class="row"><span>Data</span><span>${formatDate(sale.createdAt)}</span></div>
    <div class="row"><span>Vendedor</span><span>${sale.seller}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Cliente</div>
    <div class="row"><span>Nome</span><span>${sale.customer.name}</span></div>
    <div class="row"><span>CPF</span><span>${sale.customer.cpf}</span></div>
    <div class="row"><span>WhatsApp</span><span>${sale.customer.whatsapp}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Itens</div>
    <table class="items-table">
      <thead><tr><th>Item</th><th>Qtd</th><th>Valor</th></tr></thead>
      <tbody>
        ${sale.items
          .map(
            (i) =>
              `<tr><td>${i.name}${i.serial ? `<br/><span style="font-size:10px;color:#6e6e73">${i.serial}</span>` : ""}</td><td>${i.quantity}</td><td>${formatCurrency(i.price * i.quantity)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Pagamento</div>
    ${sale.payments
      .map(
        (p) =>
          `<div class="row"><span>${p.method}${p.installments && p.installments > 1 ? ` ${p.installments}x` : ""}</span><span>${formatCurrency(p.amount)}</span></div>`
      )
      .join("")}
    ${sale.tradeIn ? `<div class="row"><span>Aparelho de Troca</span><span>-${formatCurrency(sale.tradeInDiscount)}</span></div>` : ""}
    ${sale.discount > 0 ? `<div class="row"><span>Desconto</span><span>-${formatCurrency(sale.discount)}</span></div>` : ""}
    <div class="row total"><span>Total</span><span>${formatCurrency(sale.total)}</span></div>
  </div>

  ${
    warrantyBlocks
      ? `<div class="section">
          <div class="section-title">Certificado de Garantia</div>
          ${warrantyBlocks}
        </div>`
      : ""
  }

  <div class="footer">
    <p>Prime Paulista – Obrigado pela preferência!</p>
    <p style="margin-top:4px;">Este documento é um comprovante de venda.</p>
  </div>
</body>
</html>`;
}

export function printReceipt(sale: Sale, devices: Device[]) {
  const html = generateReceiptHTML(sale, devices);
  const win = window.open("", "_blank", "width=420,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }
}
