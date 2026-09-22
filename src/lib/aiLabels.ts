// Rótulos da IA no atendimento (Fase 5B). Só front: nada aqui precisa ser igual ao servidor.
import type { AiKind } from "@/lib/api";

export const AI_KIND_LABELS: Record<AiKind, string> = {
  preco: "Cotação & Preços",
  troca: "Avaliação de Troca",
  os: "Consulta de Status de OS",
  geral: "Atendimento geral",
};
export const AI_KINDS: AiKind[] = ["preco", "troca", "os", "geral"];

// Barra de confiança: verde alto, âmbar médio, vermelho baixo
export function confidenceTone(c: number, threshold: number): "ok" | "warn" | "low" {
  if (c >= threshold) return "ok";
  if (c >= threshold - 0.25) return "warn";
  return "low";
}
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado e enviado",
  editado: "Editado e enviado",
  descartado: "Descartado",
};

export const GEMINI_KEY_HINT = "Configurações › Variáveis › GEMINI_API_KEY";
