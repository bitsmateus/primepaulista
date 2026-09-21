// Escapa texto digitado pelo usuário antes de colocá-lo em HTML montado à mão
// (janelas de impressão). Evita que nome de cliente/observação vire código.
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
