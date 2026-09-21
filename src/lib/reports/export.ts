import { downloadBlob, downloadCsv } from "@/lib/download";
import { downloadXlsx } from "@/lib/excel";
import { getLogoSrc, getStoreSettings } from "@/lib/storeSettings";
import { toExcelData } from "./format";
import { reportCsv, reportFileName, type ExportFormat } from "./index";
import { buildReportPdf, imageToDataUrl } from "./pdf";
import type { ReportResult } from "./types";

// Exporta um relatório já montado (o que aparece na prévia = o que vai para o arquivo).
export async function exportReport(report: ReportResult, format: ExportFormat, generatedBy: string): Promise<void> {
  const name = reportFileName(report.id, format);
  if (format === "csv") {
    const { header, rows } = reportCsv(report);
    downloadCsv(name, header, rows);
    return;
  }
  if (format === "xlsx") {
    const { header, rows } = toExcelData(report);
    const widths = report.columns.map((c) => (c.format === "money" || c.format === "int" || c.format === "percent" ? 16 : c.format?.startsWith("date") ? 18 : c.key === "descricao" || c.key === "item" || c.key === "itens" || c.key === "obs" ? 44 : 24));
    await downloadXlsx(name, header, rows, widths);
    return;
  }
  const store = getStoreSettings();
  const logo = await imageToDataUrl(getLogoSrc());
  const blob = await buildReportPdf(report, {
    storeName: store.name,
    slogan: store.slogan,
    address: store.address,
    cnpj: store.cnpj,
    logoDataUrl: logo,
    generatedBy,
  });
  downloadBlob(blob, name);
}
