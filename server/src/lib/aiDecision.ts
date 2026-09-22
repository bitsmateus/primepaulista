// Decisão "enviar sozinho" x "mandar para revisão" e limitador por telefone. Arquivo puro (sem imports).

export interface AiDecisionConfig {
  enabled: boolean;
  autoSend: boolean;
  confidenceThreshold: number; // 0..1
  maxAutoPerHour: number; // por telefone
}

export interface DecideInput {
  config: AiDecisionConfig;
  confidence: number;
  needsHuman: boolean;
  autoSentLastHour: number; // respostas automáticas já enviadas (ou em envio) a este telefone na última hora
}

export interface Decision {
  action: "auto" | "review";
  reason: string; // por que foi para revisão (vazio quando auto)
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

// Só responde sozinho se TUDO for verdade: IA ligada, envio automático ligado, IA não pediu humano,
// confiança >= limiar e limite por telefone/hora não atingido. Qualquer outra coisa vai para a revisão.
export function decideDelivery(i: DecideInput): Decision {
  const c = i.config;
  if (!c.enabled) return { action: "review", reason: "IA desligada (interruptor geral)." };
  if (i.needsHuman) return { action: "review", reason: "A IA pediu revisão humana." };
  if (!(i.confidence >= c.confidenceThreshold)) {
    return { action: "review", reason: `Confiança ${pct(i.confidence)} abaixo do mínimo (${pct(c.confidenceThreshold)}).` };
  }
  if (!c.autoSend) return { action: "review", reason: "Envio automático desligado." };
  if (i.autoSentLastHour >= c.maxAutoPerHour) {
    return { action: "review", reason: `Limite de ${c.maxAutoPerHour} resposta(s) automática(s) por hora para este telefone.` };
  }
  return { action: "auto", reason: "" };
}

// Quantas respostas automáticas dentro da janela (padrão 1 hora)
export function countInWindow(stamps: Date[], now: Date, windowMs = 3_600_000): number {
  const from = now.getTime() - windowMs;
  return stamps.filter((d) => d.getTime() > from && d.getTime() <= now.getTime() + 1000).length;
}
