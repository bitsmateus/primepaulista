// Busca por relevância: ignora acentos/maiúsculas, aceita palavras em qualquer ordem
// e põe o melhor resultado na primeira linha (nome começando com o termo vem antes
// de um que só contém o termo no meio).
export const foldText = (s: string): string =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Pontuação (menor = mais relevante); null quando algum termo não aparece.
export function searchScore(text: string, query: string): number | null {
  const q = foldText(query).trim();
  if (!q) return 0;
  const hay = foldText(text);
  const tokens = q.split(/\s+/);
  if (!tokens.every((t) => hay.includes(t))) return null;
  let score = 0;
  if (hay === q) score -= 1000;
  else if (hay.startsWith(q)) score -= 500;
  else if (hay.includes(q)) score -= 250;
  for (const t of tokens) {
    const i = hay.indexOf(t);
    const atWordStart = i === 0 || /[\s\-/(]/.test(hay[i - 1]);
    score += atWordStart ? i : 100 + i;
  }
  return score + hay.length / 1000; // desempate: nome mais curto primeiro
}

export function rankBySearch<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  return items
    .map((item, idx) => ({ item, idx, score: searchScore(getText(item), query) }))
    .filter((r): r is { item: T; idx: number; score: number } => r.score !== null)
    .sort((a, b) => a.score - b.score || a.idx - b.idx)
    .map((r) => r.item);
}
