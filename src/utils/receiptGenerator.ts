import { Sale, Device } from "@/types/inventory";
import { formatCapacity } from "@/lib/utils";
import logo from "@/assets/logo-prime-paulista.png";

// Dados da loja (cabeçalho do recibo)
const STORE = {
  name: "Prime Paulista",
  slogan: "Sua loja no ❤️ de SP",
  whatsapp: "11 97038-3539",
  facebook: "Prime Paulista",
  instagram: "@primeavpaulista",
  email: "primeavpaulista@gmail.com",
  address: "Av. Paulista, 2064 - Ed. Paulista - 14º Andar",
  cnpj: "35.646.573/0001-71",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function generateReceiptHTML(sale: Sale, devices: Device[]): string {
  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const logoUrl = `${window.location.origin}${logo}`;
  const c = sale.customer;

  // Linhas de Modelo / IMEI a partir dos aparelhos da venda
  const deviceItems = sale.items.filter((i) => i.type === "device");
  const deviceLines = deviceItems.map((item) => {
    const dev = devices.find((d) => d.id === item.deviceId);
    const modelo = dev
      ? `${dev.model} ${formatCapacity(dev.capacity)} ${dev.color}`.trim()
      : item.name;
    return {
      modelo,
      imei1: dev?.serialImei || item.serial || "",
      imei2: dev?.imei2 || "",
      serial: dev?.serial || dev?.internalSerial || "",
    };
  });

  const subtotal = sale.items.reduce((s, i) => s + i.price * i.quantity, 0);
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
<title>Recibo de Venda – Prime Paulista</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, Arial, sans-serif; color: #111; font-size: 12px; }
  .page { max-width: 620px; margin: 0 auto; padding: 18px; }
  .page + .page { page-break-before: always; }

  /* Cabeçalho */
  .head { background: #3a3a3c; color: #fff; border-radius: 8px; padding: 14px 16px; display: flex; gap: 14px; align-items: center; }
  .head img { height: 56px; width: 56px; object-fit: contain; border-radius: 50%; background: #fff; padding: 4px; }
  .head .contacts { font-size: 11px; line-height: 1.6; }
  .head .contacts b { font-weight: 600; }
  .addr { text-align: center; font-weight: 700; font-size: 12px; margin-top: 8px; }
  .cnpj { text-align: right; font-size: 11px; color: #444; margin-top: 2px; }

  /* Campos */
  .fields { border: 1px solid #111; border-radius: 6px; padding: 10px 12px; margin-top: 8px; }
  .field { display: flex; gap: 6px; padding: 3px 0; border-bottom: 1px dotted #bbb; }
  .field:last-child { border-bottom: none; }
  .field .lbl { font-weight: 600; min-width: 64px; }
  .field .val { flex: 1; }
  .two { display: flex; gap: 16px; }
  .two .field { flex: 1; }

  /* Tabela de itens */
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #111; padding: 6px 8px; font-size: 11px; }
  th { background: #f0f0f0; text-transform: uppercase; font-size: 10px; letter-spacing: .5px; }
  td.c { text-align: center; }
  td.r { text-align: right; }
  .totrow td { font-weight: 700; font-size: 13px; }
  .subrow td { color: #444; }

  /* Rodapé garantia (frente) */
  .warranty-foot { border: 1px solid #111; border-radius: 6px; margin-top: 10px; padding: 8px; text-align: center; font-weight: 700; font-size: 11px; line-height: 1.5; }

  /* Termo (verso) */
  .term h1 { text-align: center; font-size: 14px; margin-bottom: 6px; }
  .term p { font-size: 9.5px; line-height: 1.3; margin-bottom: 3px; text-align: justify; }
  .term .lead { font-weight: 700; }
  .term ul { margin: 0 0 4px 14px; }
  .term li { font-size: 9.5px; line-height: 1.3; margin-bottom: 2px; text-align: justify; }
  .term .sec { font-weight: 700; margin-top: 4px; }
  .sign { margin-top: 18px; text-align: center; }
  .sign .agree { font-weight: 600; margin-bottom: 14px; }
  .sign .line { width: 70%; margin: 0 auto; border-top: 1px solid #111; padding-top: 4px; font-size: 9.5px; }

  @media print { .page { padding: 6px; } @page { margin: 8mm; } }
</style>
</head>
<body>

<!-- ===== FRENTE: RECIBO ===== -->
<div class="page">
  <div class="head">
    <img src="${logoUrl}" alt="Prime Paulista" />
    <div class="contacts">
      <div>📱 ${STORE.whatsapp}</div>
      <div>📘 ${STORE.facebook}</div>
      <div>📷 ${STORE.instagram}</div>
      <div>✉️ ${STORE.email}</div>
    </div>
  </div>
  <div class="addr">${STORE.address}</div>
  <div class="cnpj">CNPJ: ${STORE.cnpj}</div>

  <div class="fields">
    ${fieldRow("Data", formatDate(sale.createdAt))}
    ${fieldRow("Cliente", c?.name ?? "")}
    <div class="two">
      ${fieldRow("CPF", c?.cpf ?? "")}
      ${fieldRow("Telefone", c?.whatsapp ?? "")}
    </div>
    ${fieldRow("E-mail", "")}
    ${deviceLines
      .map(
        (d) => `
      ${fieldRow("Modelo", d.modelo)}
      ${d.imei1 ? fieldRow("IMEI 1", d.imei1) : ""}
      ${d.imei2 ? fieldRow("IMEI 2", d.imei2) : ""}
      ${d.serial ? fieldRow("Serial", d.serial) : ""}`
      )
      .join("")}
  </div>

  <table>
    <thead>
      <tr><th style="width:48px">Quant.</th><th>Discriminação</th><th style="width:90px">Preço Unit.</th><th style="width:90px">Preço Total</th></tr>
    </thead>
    <tbody>
      ${itemRows}
      ${
        sale.tradeInDiscount > 0
          ? `<tr class="subrow"><td colspan="3" class="r">Entrada (aparelho de troca)</td><td class="r">− ${fmt(sale.tradeInDiscount)}</td></tr>`
          : ""
      }
      ${
        sale.discount > 0
          ? `<tr class="subrow"><td colspan="3" class="r">Desconto</td><td class="r">− ${fmt(sale.discount)}</td></tr>`
          : ""
      }
      ${
        sale.tradeInDiscount > 0 || sale.discount > 0
          ? `<tr class="subrow"><td colspan="3" class="r">Subtotal</td><td class="r">${fmt(subtotal)}</td></tr>`
          : ""
      }
      <tr class="totrow"><td colspan="3" class="r">TOTAL</td><td class="r">${fmt(sale.total)}</td></tr>
    </tbody>
  </table>

  <div class="warranty-foot">
    APARELHO LACRADO 1 ANO DE GARANTIA PELO FABRICANTE<br/>
    APARELHO SEMI NOVOS GARANTIA VIDE TERMO NO VERSO
  </div>
</div>

<!-- ===== VERSO: TERMO DE GARANTIA ===== -->
<div class="page term">
  <h1>TERMO DE GARANTIA</h1>
  <p class="lead">A garantia do aparelho é de 6 MESES ou 180 (CENTO E OITENTA) dias, a partir da data de compra; sendo:</p>
  <ul>
    <li>A garantia sobre o aparelho é de 6 meses contra eventuais defeitos de fabricação, defeitos esses não provocados por mau uso do mesmo.</li>
    <li>A GARANTIA DA BATERIA É DE 90 (NOVENTA) dias e está de acordo com o artigo 26, inciso II, do Código de Defesa do Consumidor.</li>
    <li>Funcionamento, instalação e atualização de aplicativos, bem como o sistema operacional do aparelho, NÃO FAZEM parte desta garantia.</li>
    <li>Limpeza e conservação do aparelho NÃO FAZEM parte desta garantia.</li>
    <li>A não apresentação deste documento (recibo/termo de garantia) que comprove a compra INVALIDA a garantia.</li>
    <li>Qualquer mau funcionamento APÓS ATUALIZAÇÕES do sistema operacional ou aplicativos NÃO FAZ PARTE DESSA GARANTIA.</li>
    <li>A GARANTIA é válida somente para o item descrito no recibo.</li>
  </ul>
  <p class="sec">NÃO ESTÃO INCLUSOS NESTA GARANTIA ACESSÓRIOS E TODAS AS PARTES EXTERNAS DO CELULAR, TAIS COMO:</p>
  <p>Lentes, carcaças, capas, cases, botões laterais, tampas, películas protetoras, fones de ouvido e partes que se desgastam com o uso.</p>
  <p class="sec">A GARANTIA É CANCELADA NOS SEGUINTES CASOS:</p>
  <p>Em ocasião de quedas, esmagamentos, sobrecarga elétrica; exposição do aparelho a altas temperaturas, umidade ou líquidos; exposição do aparelho a poeira, pó e/ou limalha de metais; ou ainda quando constatado mau uso do aparelho, instalações, modificações ou atualizações no seu sistema operacional; rompimento do lacre/selo colocado pela Prime Paulista; e abertura do equipamento ou tentativa de conserto deste por terceiros que não sejam os técnicos da Prime Paulista, mesmo que para realização de outros serviços.</p>
  <div class="sign">
    <p class="agree">Li e concordo com os termos descritos acima.</p>
    <div class="line">ASSINATURA DO CLIENTE</div>
  </div>
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
