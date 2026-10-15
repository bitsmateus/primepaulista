// Primeira letra de cada palavra em maiúscula (mantém "de", "da", "do", "das", "dos", "e" em minúsculo).
// Espelha capitalizeName do front (src/lib/utils.ts); só mexe na 1ª letra de cada palavra.
const PARTICLES = new Set(["de", "da", "do", "das", "dos", "e"]);
export function capitalizeName(value: string): string {
  return value.replace(/(^|\s)(\p{L})(\p{L}*)/gu, (_m, sep: string, first: string, rest: string) =>
    PARTICLES.has((first + rest).toLowerCase()) && sep !== "" ? sep + first + rest : sep + first.toUpperCase() + rest
  );
}
