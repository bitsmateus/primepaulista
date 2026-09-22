import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useAiConfig } from "@/hooks/useAI";
import type { AiSettingsView } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const sameConfig = (a: AiSettingsView, b: AiSettingsView) => JSON.stringify(a) === JSON.stringify(b);

// Configuração da IA: interruptor geral, modelo, temperatura, limiar, envio automático, tom e guardrails
export function AiConfigTab() {
  const { data, isLoading, save } = useAiConfig();
  const [cfg, setCfg] = useState<AiSettingsView | null>(null);
  const [newRule, setNewRule] = useState("");
  const [confirmAuto, setConfirmAuto] = useState(false);

  useEffect(() => {
    if (data) setCfg({ ...data.config, guardrails: [...data.config.guardrails] });
  }, [data]);

  if (isLoading || !cfg || !data) return <p className="text-sm text-muted-foreground">Carregando configuração…</p>;
  const dirty = !sameConfig(cfg, data.config);
  const set = (patch: Partial<AiSettingsView>) => setCfg({ ...cfg, ...patch });
  const num = (v: string, fallback: number) => (v.trim() === "" || Number.isNaN(Number(v)) ? fallback : Number(v));

  const addRule = () => {
    const t = newRule.trim();
    if (!t) return;
    if (t.length > 400) { toast.error("A regra pode ter no máximo 400 caracteres."); return; }
    if (cfg.guardrails.some((g) => g.toLowerCase() === t.toLowerCase())) { toast.error("Essa regra já existe."); return; }
    set({ guardrails: [...cfg.guardrails, t] });
    setNewRule("");
  };

  const submit = async () => {
    if (!cfg.model.trim()) { toast.error("Informe o modelo do Gemini."); return; }
    if (!cfg.tone.trim()) { toast.error("Informe o tom de voz."); return; }
    if (cfg.temperature < 0 || cfg.temperature > 1) { toast.error("A temperatura vai de 0 a 1."); return; }
    if (cfg.confidenceThreshold < 0 || cfg.confidenceThreshold > 1) { toast.error("O limiar de confiança vai de 0% a 100%."); return; }
    try {
      await save.mutateAsync({ ...cfg, model: cfg.model.trim(), tone: cfg.tone.trim() });
      toast.success("Configuração da IA salva.");
    } catch {
      /* onError do hook avisa */
    }
  };

  return (
    <div className="space-y-4" data-testid="ai-config">
      <Card className="border shadow-none">
        <CardHeader className="pb-2"><CardTitle className="text-base">Liga e desliga</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="ai-enabled" className="text-sm font-medium">IA ligada</Label>
              <p className="text-xs text-muted-foreground">Interruptor geral (kill-switch). Desligado: nenhuma resposta é gerada nem enviada (nem sugestões na conversa). O simulador continua funcionando para testes.</p>
            </div>
            <Switch id="ai-enabled" aria-label="IA ligada" checked={cfg.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="ai-auto" className="text-sm font-medium">Envio automático</Label>
              <p className="text-xs text-muted-foreground">Ligado: as regras com ação “IA” respondem sozinhas quando a confiança for alta e nada precisar de humano. Desligado (padrão): toda resposta vai para a fila de revisão. <strong>Só ligue depois de testar no simulador.</strong></p>
            </div>
            <Switch id="ai-auto" aria-label="Envio automático" checked={cfg.autoSend} onCheckedChange={(v) => (v && !cfg.autoSend ? setConfirmAuto(true) : set({ autoSend: v }))} />
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardHeader className="pb-2"><CardTitle className="text-base">Modelo e limites</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="ai-model">Modelo do Gemini</Label>
            <Input id="ai-model" aria-label="Modelo do Gemini" value={cfg.model} onChange={(e) => set({ model: e.target.value })} placeholder="gemini-2.5-flash" />
          </div>
          <div>
            <Label htmlFor="ai-temp">Temperatura (0 a 1)</Label>
            <Input id="ai-temp" aria-label="Temperatura" type="number" step="0.1" min={0} max={1} value={cfg.temperature} onChange={(e) => set({ temperature: num(e.target.value, cfg.temperature) })} />
            <p className="mt-1 text-xs text-muted-foreground">Menor = respostas mais previsíveis.</p>
          </div>
          <div>
            <Label htmlFor="ai-thr">Confiança mínima para enviar sozinha (%)</Label>
            <Input id="ai-thr" aria-label="Limiar de confiança (%)" type="number" step="1" min={0} max={100} value={Math.round(cfg.confidenceThreshold * 100)} onChange={(e) => set({ confidenceThreshold: Math.min(1, Math.max(0, num(e.target.value, cfg.confidenceThreshold * 100) / 100)) })} />
          </div>
          <div>
            <Label htmlFor="ai-tokens">Tamanho máximo da resposta (tokens)</Label>
            <Input id="ai-tokens" aria-label="Máximo de tokens da resposta" type="number" min={64} max={8192} value={cfg.maxOutputTokens} onChange={(e) => set({ maxOutputTokens: Math.round(num(e.target.value, cfg.maxOutputTokens)) })} />
          </div>
          <div>
            <Label htmlFor="ai-hour">Respostas automáticas por telefone por hora</Label>
            <Input id="ai-hour" aria-label="Respostas automáticas por hora" type="number" min={1} max={60} value={cfg.maxAutoPerHour} onChange={(e) => set({ maxAutoPerHour: Math.round(num(e.target.value, cfg.maxAutoPerHour)) })} />
          </div>
          <div>
            <Label htmlFor="ai-hist">Mensagens anteriores enviadas como contexto</Label>
            <Input id="ai-hist" aria-label="Mensagens de contexto" type="number" min={0} max={20} value={cfg.historyMessages} onChange={(e) => set({ historyMessages: Math.round(num(e.target.value, cfg.historyMessages)) })} />
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardHeader className="pb-2"><CardTitle className="text-base">Tom de voz</CardTitle></CardHeader>
        <CardContent>
          <Textarea aria-label="Tom de voz" rows={2} maxLength={400} value={cfg.tone} onChange={(e) => set({ tone: e.target.value })} />
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Guardrails (regras que a IA sempre segue)</CardTitle>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => set({ guardrails: [...data.defaults.guardrails] })}>
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <ol className="space-y-1.5" data-testid="guardrail-list">
            {cfg.guardrails.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma regra. Adicione pelo menos as de preço e desconto.</li>}
            {cfg.guardrails.map((g, i) => (
              <li key={`${i}-${g}`} className="flex items-start gap-2 rounded-md border p-2 text-sm" data-testid="guardrail-item">
                <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold text-muted-foreground">{i + 1}.</span>
                <span className="flex-1">{g}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remover regra ${i + 1}`} onClick={() => set({ guardrails: cfg.guardrails.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <Input aria-label="Nova regra (guardrail)" value={newRule} maxLength={400} placeholder="Ex.: Não falar de concorrentes." onChange={(e) => setNewRule(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRule(); } }} />
            <Button variant="outline" className="gap-1" onClick={addRule}><Plus className="h-4 w-4" /> Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={!dirty || save.isPending}>{save.isPending ? "Salvando…" : "Salvar configuração"}</Button>
        {dirty && <span className="text-xs text-muted-foreground" data-testid="ai-config-dirty">Alterações não salvas</span>}
        <Button variant="ghost" disabled={!dirty} onClick={() => setCfg({ ...data.config, guardrails: [...data.config.guardrails] })}>Descartar alterações</Button>
      </div>

      <AlertDialog open={confirmAuto} onOpenChange={setConfirmAuto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ligar o envio automático?</AlertDialogTitle>
            <AlertDialogDescription>
              A IA passará a responder clientes sozinha (nas regras com ação “IA”) quando a confiança for igual ou maior que {Math.round(cfg.confidenceThreshold * 100)}%.
              Teste bastante no simulador e revise os guardrails antes. Você pode desligar a qualquer momento (e o interruptor “IA ligada” para tudo na hora).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { set({ autoSend: true }); setConfirmAuto(false); }}>Ligar envio automático</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
