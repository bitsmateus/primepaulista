import { ServiceOrder } from "@/types/serviceOrder";
import { WARRANTY_DAYS, WARRANTY_TEXT } from "@/lib/warranty";

// Garantia padrão do reparo (dias). Política centralizada em src/lib/warranty.ts.
export const OS_WARRANTY_DAYS = WARRANTY_DAYS.servico;

export function generateOSReceiptHTML(order: ServiceOrder): string {
  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const formatDay = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Início da garantia = conclusão (ou hoje, se ainda não finalizada)
  const warrantyStart = order.completedAt ? new Date(order.completedAt) : new Date();
  const warrantyEnd = new Date(warrantyStart);
  warrantyEnd.setDate(warrantyEnd.getDate() + OS_WARRANTY_DAYS);

  const checklistItems = [
    order.checklist.capa ? "Capa" : null,
    order.checklist.chip ? "Chip" : null,
    order.checklist.carregador ? "Carregador" : null,
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Recibo OS – ${order.id.slice(0, 8)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; color: #1c1c1e; padding: 32px; max-width: 380px; margin: auto; font-size: 13px; }
    .header { text-align: center; border-bottom: 2px solid #1c1c1e; padding-bottom: 16px; margin-bottom: 16px; }
    .header h1 { font-size: 18px; font-weight: 700; }
    .header p { font-size: 11px; color: #6e6e73; margin-top: 2px; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6e6e73; margin-bottom: 8px; font-weight: 600; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; gap: 12px; }
    .row span:last-child { text-align: right; }
    .row.total { font-weight: 700; font-size: 16px; border-top: 2px solid #1c1c1e; padding-top: 8px; margin-top: 8px; }
    .box { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-top: 8px; }
    .text { font-size: 12px; line-height: 1.5; }
    .footer { text-align: center; margin-top: 24px; font-size: 10px; color: #6e6e73; border-top: 1px dashed #ccc; padding-top: 12px; }
    .sign { margin-top: 28px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .sign .line { width: 80%; border-top: 1px solid #1c1c1e; }
    @media print { body { padding: 8px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Prime Paulista</h1>
    <p>Sua Loja no ❤️ de SP</p>
    <p style="margin-top:8px;font-size:12px;">RECIBO DE ORDEM DE SERVIÇO</p>
  </div>

  <div class="section">
    <div class="section-title">Dados da OS</div>
    <div class="row"><span>Nº</span><span>${order.id.slice(0, 8).toUpperCase()}</span></div>
    <div class="row"><span>Abertura</span><span>${formatDate(order.createdAt)}</span></div>
    <div class="row"><span>Status</span><span>${order.status}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Cliente</div>
    <div class="row"><span>Nome</span><span>${order.customerName}</span></div>
    ${order.customerCpf ? `<div class="row"><span>CPF</span><span>${order.customerCpf}</span></div>` : ""}
    ${order.customerPhone ? `<div class="row"><span>WhatsApp</span><span>${order.customerPhone}</span></div>` : ""}
  </div>

  <div class="section">
    <div class="section-title">Aparelho</div>
    <div class="row"><span>Modelo</span><span>${order.model}${order.color ? ` – ${order.color}` : ""}</span></div>
    ${order.serialImei ? `<div class="row"><span>IMEI 1</span><span>${order.serialImei}</span></div>` : ""}
    ${order.imei2 ? `<div class="row"><span>IMEI 2</span><span>${order.imei2}</span></div>` : ""}
    ${order.serial ? `<div class="row"><span>Serial</span><span>${order.serial}</span></div>` : ""}
    ${order.batteryHealth ? `<div class="row"><span>Bateria</span><span>${order.batteryHealth}%</span></div>` : ""}
    ${checklistItems.length ? `<div class="row"><span>Acessórios na entrada</span><span>${checklistItems.join(", ")}</span></div>` : ""}
  </div>

  <div class="section">
    <div class="section-title">Serviço</div>
    <p class="text"><strong>Defeito relatado:</strong> ${order.reportedIssue || "-"}</p>
    ${order.partDescription ? `<p class="text" style="margin-top:4px;"><strong>Peça/Serviço:</strong> ${order.partDescription}</p>` : ""}
    ${order.technicalNotes ? `<p class="text" style="margin-top:4px;"><strong>Observações:</strong> ${order.technicalNotes}</p>` : ""}
  </div>

  <div class="section">
    <div class="section-title">Valores</div>
    <div class="row total"><span>Total do serviço</span><span>${formatCurrency(order.chargedAmount)}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Certificado de Garantia</div>
    <div class="box">
      <p style="font-weight:600;color:#30d158;margin-bottom:6px;">
        ${WARRANTY_TEXT.servicoTitulo}
      </p>
      <p class="text">
        ${WARRANTY_TEXT.servicoDescricao}
      </p>
      <p class="text" style="margin-top:6px;"><strong>Válida até:</strong> ${formatDay(warrantyEnd)}</p>
    </div>
  </div>

  <div class="sign">
    <div class="line"></div>
    <span style="font-size:11px;color:#6e6e73;">Assinatura do cliente (retirada)</span>
  </div>

  <div class="footer">
    <p>Prime Paulista – Obrigado pela preferência!</p>
    <p style="margin-top:4px;">Apresente este recibo para acionar a garantia.</p>
  </div>
</body>
</html>`;
}

export function printOSReceipt(order: ServiceOrder) {
  const html = generateOSReceiptHTML(order);
  const win = window.open("", "_blank", "width=420,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }
}
