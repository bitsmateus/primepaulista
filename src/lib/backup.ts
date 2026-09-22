// Lê o arquivo de backup e devolve só as configurações (chave -> valor).
// Aceita o formato do backup do sistema ({ settings: {...} } ou { tables: { appSettings: [{key,value}] } })
// e um arquivo simples { chave: valor }. O servidor valida cada chave (só as permitidas são restauradas).
export function extractSettingsFromBackup(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  if (o.settings && typeof o.settings === "object" && !Array.isArray(o.settings)) {
    return o.settings as Record<string, unknown>;
  }
  const tables = o.tables as Record<string, unknown> | undefined;
  const rows = tables?.appSettings;
  if (Array.isArray(rows)) {
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      if (r && typeof r === "object" && typeof (r as { key?: unknown }).key === "string") {
        out[(r as { key: string }).key] = (r as { value?: unknown }).value;
      }
    }
    return out;
  }
  if (o.version !== undefined || o.tables !== undefined) return null; // backup sem configurações
  return o;
}
