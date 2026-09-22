import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Send, Sparkles, X } from "lucide-react";
import { api, ApiError, type AiSuggestion } from "@/lib/api";
import { useAiStatus } from "@/hooks/useAI";
import { ConfidenceBar } from "@/components/ai/AiBits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// "✨ Sugerir resposta com IA" na conversa do lead. Nada é enviado sozinho: o atendente usa, edita, envia ou descarta.
export default function AiSuggestPanel({
  leadId, lastInbound, canSend, onUse, onSend,
}: {
  leadId: string;
  lastInbound: string;
  canSend: boolean;
  onUse: (text: string) => void;
  onSend: (text: string) => Promise<boolean>;
}) {
  const { data: st } = useAiStatus();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(lastInbound);
  const [busy, setBusy] = useState(false);
  const [sug, setSug] = useState<AiSuggestion | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcome = (o: "usada" | "enviada_humano" | "descartada") => {
    if (sug) void api.aiEventOutcome(sug.eventId, o).catch(() => undefined);
  };
  const reset = () => { setSug(null); setEditing(false); setError(null); };

  const run = async () => {
    setBusy(true);
    setError(null);
    setSug(null);
    setEditing(false);
    try {
      const r = await api.aiSuggest({ leadId, message: question.trim() || undefined });
      setSug(r);
      setText(r.reply);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível gerar a sugestão.");
    } finally {
      setBusy(false);
    }
  };

  const notReady = st && (!st.configured || !st.enabled);
  const low = sug && (sug.lowConfidence || sug.needsHuman);

  if (!open) {
    return (
      <div className="space-y-1">
        <Button type="button" variant="outline" size="sm" className="gap-1" aria-label="Sugerir resposta com IA" onClick={() => setOpen(true)}>
          <Sparkles className="h-4 w-4" /> ✨ Sugerir resposta com IA
        </Button>
        {notReady && (
          <p className="text-xs text-muted-foreground" data-testid="suggest-notready">
            {!st.configured ? "IA não configurada (falta a chave GEMINI_API_KEY)." : "A IA está desligada."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3" data-testid="suggest-panel">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-sm font-medium"><Sparkles className="h-4 w-4" /> Sugestão da IA</p>
        <button type="button" aria-label="Fechar sugestão" className="text-muted-foreground hover:text-foreground" onClick={() => { setOpen(false); reset(); }}><X className="h-4 w-4" /></button>
      </div>
      <div>
        <Label htmlFor="sg-q" className="text-xs">Pergunta do cliente (edite se quiser)</Label>
        <Textarea id="sg-q" aria-label="Pergunta do cliente para a IA" rows={2} maxLength={2000} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Cole ou escreva a pergunta do cliente" />
      </div>
      <Button type="button" size="sm" className="gap-1" disabled={busy || !question.trim()} onClick={run}>
        <Sparkles className="h-4 w-4" /> {busy ? "Gerando…" : sug ? "Gerar de novo" : "Gerar sugestão"}
      </Button>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive" role="alert" data-testid="suggest-error">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {sug && (
        <div className="space-y-2" data-testid="suggest-result">
          {low && (
            <div className="flex items-start gap-2 rounded-md border border-warning/60 bg-warning/10 p-2 text-xs" data-testid="suggest-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span><strong>Baixa confiança IA — revise antes de enviar.</strong>{sug.needsHuman ? " A IA pediu revisão humana." : ""}{sug.reason ? ` ${sug.reason}` : ""}</span>
            </div>
          )}
          <Textarea aria-label="Sugestão da IA" rows={4} readOnly={!editing} value={text} onChange={(e) => setText(e.target.value)} className={editing ? "" : "bg-background"} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <ConfidenceBar value={sug.confidence} threshold={st?.confidenceThreshold ?? 0.75} />
            {sug.sources.length > 0 && <span className="text-xs text-muted-foreground" data-testid="suggest-sources">Fontes: {sug.sources.map((s) => s.title).join(" · ")}</span>}
            {sug.usedContext.stock > 0 && <Badge variant="outline" className="text-xs">estoque: {sug.usedContext.stock}</Badge>}
            {sug.usedContext.os && <Badge variant="outline" className="text-xs">OS confirmada</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => { onUse(text); outcome("usada"); toast.success("Sugestão colocada no campo de mensagem."); }}>Usar</Button>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Editar</Button>
            <Button type="button" size="sm" variant="outline" className="gap-1" disabled={!canSend || !text.trim()} title={canSend ? "" : "WhatsApp não conectado"} onClick={async () => { if (await onSend(text.trim())) { outcome("enviada_humano"); setOpen(false); reset(); } }}>
              <Send className="h-4 w-4" /> Enviar
            </Button>
            <Button type="button" size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => { outcome("descartada"); reset(); toast.info("Sugestão descartada."); }}>Descartar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
