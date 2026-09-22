// Configuração padrão da IA (Fase 5B). Arquivo puro (sem imports).

export interface AiSettings {
  enabled: boolean; // interruptor geral (kill-switch): desligado = nada é gerado nem enviado
  model: string;
  temperature: number; // 0..1
  maxOutputTokens: number;
  confidenceThreshold: number; // 0..1: abaixo disso a resposta vai para revisão
  autoSend: boolean; // responder sozinho (desligado por padrão)
  maxAutoPerHour: number; // respostas automáticas por telefone por hora
  historyMessages: number; // últimas N mensagens da conversa enviadas como contexto
  tone: string;
  guardrails: string[];
}

export const DEFAULT_GUARDRAILS: string[] = [
  "Não conceder desconto acima de 5% sem autorização do gerente; se o cliente pedir mais, diga que vai consultar o gerente.",
  "Não incentivar modificações de software não oficiais nem desbloqueio de iCloud.",
  "Nunca inventar preço, prazo ou disponibilidade: se não souber, dizer que vai confirmar com a equipe.",
  "Nunca revelar custo, margem ou dados de outros clientes.",
  "Não prometer o que a política de garantia não cobre.",
];

export const DEFAULT_TONE = "Amigável, consultivo, empático e prestativo";

export const DEFAULT_AI: AiSettings = {
  enabled: false,
  model: "gemini-2.5-flash",
  temperature: 0.4,
  maxOutputTokens: 1024,
  confidenceThreshold: 0.75,
  autoSend: false,
  maxAutoPerHour: 3,
  historyMessages: 6,
  tone: DEFAULT_TONE,
  guardrails: DEFAULT_GUARDRAILS,
};

export const AI_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,59}$/;
