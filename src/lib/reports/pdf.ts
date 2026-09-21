import type { ReportResult } from "./types";
import { fmtDateTime, toTextTable } from "./format";

// Caracteres que a fonte padrão do jsPDF (WinAnsi / latin-1) sabe desenhar.
// Tudo fora disso (emoji, setas, aspas tipográficas exóticas...) é removido para não sair lixo no PDF.
const WIN_ANSI_EXTRA = new Set([
  "€", "‚", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š", "‹", "Œ", "Ž", "‘", "’", "“", "”", "•", "–", "—", "˜", "™", "š", "›", "œ", "ž", "Ÿ",
]);

export function sanitizePdfText(input: unknown): string {
  const s = String(input ?? "").normalize("NFC");
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x00a0) out += " ";
    else if (cp === 0x09 || cp === 0x0a || cp === 0x0d) out += " ";
    else if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa1 && cp <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch;
    // demais caracteres são descartados
  }
  return out.replace(/ {2,}/g, " ").trim();
}

export interface PdfMeta {
  storeName: string;
  slogan?: string;
  address?: string;
  cnpj?: string;
  logoDataUrl?: string | null; // PNG/JPEG em data URL (opcional)
  generatedBy: string;
  generatedAt?: Date;
}

// A4; paisagem quando há muitas colunas
export const isLandscape = (r: ReportResult) => r.columns.length > 7;

// Converte uma imagem (URL) em data URL para o PDF; devolve null se não der (o PDF sai sem logo)
export async function imageToDataUrl(src: string): Promise<string | null> {
  try {
    if (src.startsWith("data:")) return src;
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Monta o PDF do relatório (jsPDF + autotable são carregados só agora)
export async function buildReportPdf(report: ReportResult, meta: PdfMeta): Promise<Blob> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;

  const landscape = isLandscape(report);
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const S = sanitizePdfText;

  // ---- cabeçalho: logo + nome da loja ----
  let y = margin;
  let textX = margin;
  if (meta.logoDataUrl) {
    try {
      const fmt = /^data:image\/jpe?g/i.test(meta.logoDataUrl) ? "JPEG" : "PNG";
      doc.addImage(meta.logoDataUrl, fmt, margin, y - 2, 14, 14);
      textX = margin + 17;
    } catch {
      /* logo inválido: segue sem */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(S(meta.storeName), textX, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110);
  const sub = [meta.slogan, meta.cnpj ? `CNPJ ${meta.cnpj}` : "", meta.address].map((x) => S(x)).filter(Boolean).join("  |  ");
  if (sub) doc.text(sub, textX, y + 9, { maxWidth: pageW - textX - margin });
  doc.setTextColor(0);
  y += 17;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // ---- título, filtros e resumo ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(S(report.title), margin, y);
  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const line of report.filters) {
    doc.text(S(line), margin, y);
    y += 4.2;
  }
  const at = meta.generatedAt ?? new Date();
  doc.setTextColor(110);
  doc.text(S(`Gerado por ${meta.generatedBy} em ${fmtDateTime(at)}`), margin, y);
  doc.setTextColor(0);
  y += 5;
  if (report.summary.length) {
    doc.setFontSize(9);
    const text = report.summary.map((s) => `${s.label}: ${s.value}`).join("   |   ");
    const lines = doc.splitTextToSize(S(text), pageW - margin * 2) as string[];
    doc.setFont("helvetica", "bold");
    doc.text(lines, margin, y);
    doc.setFont("helvetica", "normal");
    y += lines.length * 4.2 + 2;
  }

  // ---- tabela ----
  const { head, body, foot } = toTextTable(report);
  const nCols = head.length;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, top: margin, bottom: 14 },
    head: [head.map(S)],
    body: body.map((r) => r.map(S)),
    foot: foot ? [foot.map(S)] : undefined,
    showFoot: "lastPage",
    theme: "grid",
    styles: { font: "helvetica", fontSize: nCols > 10 ? 6.5 : nCols > 7 ? 7.5 : 8.5, cellPadding: 1.6, overflow: "linebreak", lineColor: [220, 220, 220], lineWidth: 0.1 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: Object.fromEntries(report.columns.map((c, i) => [i, { halign: c.align ?? "left" }])),
  });

  // ---- numeração de páginas ----
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(S(`Página ${p} de ${total}`), pageW - margin, pageH - 7, { align: "right" });
    doc.text(S(meta.storeName), margin, pageH - 7);
    doc.setTextColor(0);
  }

  return doc.output("blob");
}
