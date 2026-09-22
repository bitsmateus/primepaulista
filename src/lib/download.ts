// Baixa um Blob como arquivo (cria um link temporário)
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Escapa uma célula de CSV (aspas duplicadas)
export const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// Monta e baixa um CSV (BOM + separador ; para abrir certo no Excel pt-BR)
export function downloadCsv(fileName: string, header: string[], rows: unknown[][]) {
  const csv =
    "﻿" + [header.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), fileName);
}
