import { downloadBlob } from "@/lib/download";

// As bibliotecas de Excel são pesadas: só são carregadas quando o usuário usa.

export type ExcelCell = string | number | boolean | Date | null | undefined;

// Lê a 1ª planilha de um .xlsx e devolve as linhas (células com tipos nativos)
export async function readXlsxRows(file: File): Promise<unknown[][]> {
  const { readSheet } = await import("read-excel-file/universal");
  return (await readSheet(file)) as unknown[][];
}

// Gera e baixa um .xlsx. A 1ª linha é tratada como cabeçalho (negrito).
export async function downloadXlsx(
  fileName: string,
  header: string[],
  rows: ExcelCell[][],
  columnWidths?: number[]
) {
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  const sheetData = [
    header.map((h) => ({ value: h, fontWeight: "bold" as const })),
    ...rows.map((r) => r.map((c) => (c === undefined ? null : c))),
  ];
  const blob = await writeXlsxFile(sheetData as never, {
    columns: (columnWidths ?? header.map(() => 18)).map((width) => ({ width })),
    dateFormat: "dd/mm/yyyy", // células de data exigem um formato
  }).toBlob();
  downloadBlob(blob, fileName);
}
