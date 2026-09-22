import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FlaskConical } from "lucide-react";
import { api, ApiError, type AiKind, type AiPlaygroundResult } from "@/lib/api";
import { AI_KINDS, AI_KIND_LABELS } from "@/lib/aiLabels";
import { ConfidenceBar } from "@/components/ai/AiBits";
import { useAiConfig } from "@/hooks/useAI";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Simulador ("Simular pergunta"): mostra a resposta, a confiança, as fontes, o contexto usado, os tokens e o
// prompt enviado ao Gemini. NÃO envia nada a ninguém.
export function AiPlaygroundTab() {
  const { data: cfgData } = useAiConfig();
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"auto" | AiKind>("auto");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiPlaygroundResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const threshold = cfgData?.config.confidenceThreshold ?? 0.75;

  const run = async () => {
    if (!message.trim()) { toast.error("Digite a pergunta do cliente."); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api.aiPlayground({ message: message.trim(), kind: kind === "auto" ? undefined : kind, phone: phone.trim() || undefined });
      setResult(r);
    } catch (e) {
      setResult(null);
      setError(e instanceof ApiError ? e.message : "Não foi possível simular.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="ai-playground">
      <Card className="border shadow-none">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="h-4 w-4" /> Simular pergunta</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Nada é enviado ao cliente. O texto vai ao Gemini (sem CPF, e-mail, telefone ou endereço). Use para testar antes de ligar o envio automático.</p>
          <div>
            <Label htmlFor="pg-msg">Pergunta do cliente</Label>
            <Textarea id="pg-msg" aria-label="Pergunta do cliente" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ex.: Quanto custa o iPhone 15 Pro Max 256?" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Tipo de atendimento</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "auto" | AiKind)}>
                <SelectTrigger aria-label="Tipo de atendimento"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Detectar automaticamente</SelectItem>
                  {AI_KINDS.map((k) => <SelectItem key={k} value={k}>{AI_KIND_LABELS[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pg-phone">Telefone de quem pergunta (opcional)</Label>
              <Input id="pg-phone" aria-label="Telefone de quem pergunta" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Para testar consulta de OS: use o telefone dono da OS" />
            </div>
          </div>
          <Button onClick={run} disabled={busy}>{busy ? "Consultando o Gemini…" : "Simular"}</Button>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="alert" data-testid="pg-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {result && (
        <Card className="border shadow-none" data-testid="pg-result">
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              Resposta simulada
              <Badge variant="outline" className="text-xs">{AI_KIND_LABELS[result.kind]}</Badge>
              {result.needsHuman && <Badge variant="destructive" className="text-xs">Precisa de humano</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="whitespace-pre-line rounded-lg border bg-muted/40 p-3" data-testid="pg-reply">{result.reply}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Confiança</span><ConfidenceBar value={result.confidence} threshold={threshold} /></div>
              <span className="text-xs text-muted-foreground">Tokens: <strong data-testid="pg-tokens">{result.tokens ?? "—"}</strong></span>
              <span className="text-xs text-muted-foreground">Tempo: <strong>{result.latencyMs} ms</strong></span>
              <span className="text-xs text-muted-foreground">Modelo: {result.model}</span>
            </div>
            {result.reason && <p className="text-xs text-muted-foreground" data-testid="pg-reason">Motivo: {result.reason}</p>}
            <div className="rounded-lg border p-2 text-xs" data-testid="pg-decision" data-action={result.decision.action}>
              <strong>{result.decision.action === "auto" ? "Se fosse uma mensagem real: sairia sozinha." : "Se fosse uma mensagem real: iria para a fila de revisão."}</strong>{" "}
              {result.decision.reason}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border p-2" data-testid="pg-sources">
                <p className="mb-1 text-xs font-semibold">Fontes usadas</p>
                {result.sources.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum documento da base de conhecimento.</p> : (
                  <ul className="list-disc pl-4 text-xs">{result.sources.map((s) => <li key={s.docId}>{s.title}</li>)}</ul>
                )}
              </div>
              <div className="rounded-lg border p-2" data-testid="pg-context">
                <p className="mb-1 text-xs font-semibold">Contexto usado</p>
                <ul className="list-disc pl-4 text-xs">
                  <li>Estoque: {result.usedContext.stock} item(ns)</li>
                  <li>Ordem de serviço: {result.usedContext.os ? "sim (telefone confirmado)" : "não"}</li>
                  <li>Trechos da base: {result.usedContext.knowledge}</li>
                </ul>
              </div>
            </div>
            <details className="rounded-lg border p-2" data-testid="pg-prompt">
              <summary className="cursor-pointer text-xs font-semibold">Ver o prompt enviado ao Gemini</summary>
              <p className="mt-2 text-xs font-semibold">Pergunta enviada (sem dados pessoais)</p>
              <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">{result.question}</pre>
              <p className="mt-2 text-xs font-semibold">Instruções do sistema</p>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs" data-testid="pg-prompt-system">{result.prompt.system}</pre>
              <p className="mt-2 text-xs font-semibold">Conversa</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">{result.prompt.contents.map((c) => `[${c.role}] ${c.parts.map((p) => p.text).join("")}`).join("\n\n")}</pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
