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
