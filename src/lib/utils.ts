import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Mostra a capacidade com "GB" só quando for número puro (iPhone/iPad).
// Para Watch ("45mm"), Mac ("1TB") etc., mostra o valor como está.
export function formatCapacity(capacity: string): string {
  if (!capacity) return "";
  return /^\d+$/.test(capacity.trim()) ? `${capacity}GB` : capacity;
}

// Primeira letra de cada palavra em maiúscula ao digitar nomes (mantém "de", "da", "do"... em minúsculo).
// Só mexe na 1ª letra de cada palavra: o resto do que foi digitado é preservado.
const NAME_PARTICLES = new Set(["de", "da", "do", "das", "dos", "e"]);
export function capitalizeName(value: string): string {
  return value.replace(/(^|\s)(\p{L})(\p{L}*)/gu, (_m, sep: string, first: string, rest: string) =>
    NAME_PARTICLES.has((first + rest).toLowerCase()) && sep !== "" ? sep + first + rest : sep + first.toUpperCase() + rest
  );
}
