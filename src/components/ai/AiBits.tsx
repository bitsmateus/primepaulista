import { Link } from "react-router-dom";
import { Bot, KeyRound, Power } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";
import { confidenceTone, pct } from "@/lib/aiLabels";
import { Badge } from "@/components/ui/badge";
import { useAiStatus } from "@/hooks/useAI";

// Barra de confiança (verde = acima do limiar, âmbar = perto, vermelho = baixa)
export function ConfidenceBar({ value, threshold = 0.75 }: { value: number | null | undefined; threshold?: number }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = confidenceTone(value, threshold);
  const color = tone === "ok" ? "bg-success" : tone === "warn" ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center gap-2" data-testid="confidence-bar" data-tone={tone}>
      <div className="h-2 w-28 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Confiança da IA">
        <div className={`h-full ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums" data-testid="confidence-value">{pct(value)}</span>
    </div>
  );
}

// Estado da IA: chave cadastrada? interruptor? envio automático?
export function AiStatusBanner() {
  const { data: st } = useAiStatus();
  const { user } = useAuth();
  if (!st) return null;
  const seesVars = can(user?.role, "manageSecrets");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm" data-testid="ai-status">
      <Bot className="h-4 w-4 text-muted-foreground" />
      {!st.configured ? (
        <span className="flex flex-wrap items-center gap-2" data-testid="ai-status-nokey">
          <KeyRound className="h-4 w-4 text-destructive" />
          <span className="font-medium text-destructive">IA não configurada:</span>
          <span>
            cadastre a chave <code>GEMINI_API_KEY</code> em Configurações › Variáveis
            {seesVars && <> (<Link to="/configuracoes" className="underline">abrir Configurações</Link>)</>}.
          </span>
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-2" data-testid="ai-status-key">
          <Badge variant="outline" className="gap-1"><KeyRound className="h-3 w-3" /> Chave cadastrada ({st.keySource === "variavel" ? "variável" : "ambiente do servidor"})</Badge>
        </span>
      )}
      <Badge variant={st.enabled ? "default" : "secondary"} className="gap-1" data-testid="ai-status-enabled"><Power className="h-3 w-3" /> {st.enabled ? "IA ligada" : "IA desligada"}</Badge>
      <Badge variant={st.autoSend ? "destructive" : "outline"} data-testid="ai-status-auto">{st.autoSend ? "Envio automático LIGADO" : "Envio automático desligado"}</Badge>
      <span className="text-xs text-muted-foreground">Modelo: {st.model}</span>
    </div>
  );
}
