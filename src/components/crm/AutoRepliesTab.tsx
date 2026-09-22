import { useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, Bot, Clock, FlaskConical, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { useCRMContext } from "@/contexts/CRMContext";
import { useBusinessHours, useKeywordHits, useKeywordRules, useKeywordStats } from "@/hooks/useCRMExtras";
import { useStoreSnapshot } from "@/hooks/useAppSettings";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";
import { api, ApiError, type AiKind, type KeywordRuleInput, type KeywordRuleView, type KeywordSimulation } from "@/lib/api";
import { REPLY_VARIABLES, renderReplyTemplate } from "@/lib/crmText";
import { AI_KINDS, AI_KIND_LABELS } from "@/lib/aiLabels";
import {
  DEFAULT_SCHEDULE, RULE_CATEGORIES, matchKeywords,
  type BusinessHours, type RuleMode, type RuleSchedule,
} from "@/lib/keywordRules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MODE_LABELS: Record<RuleMode, string> = {
  always: "Sempre",
  business_hours: "Só no horário comercial",
  outside_hours: "Só fora do horário comercial",
  window: "Janela de horário e dias",
};

const dm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";

function scheduleSummary(s: RuleSchedule): string {
  const parts: string[] = [];
  if (s.mode === "window") parts.push(`${s.days.map((d) => DAY_NAMES[d]).join(", ")} ${s.from}–${s.to}`);
  else parts.push(MODE_LABELS[s.mode]);
  if (s.startDate || s.endDate) parts.push(`campanha ${s.startDate ? s.startDate.split("-").reverse().join("/") : "…"} a ${s.endDate ? s.endDate.split("-").reverse().join("/") : "…"}`);
  return parts.join(" · ");
}

interface Draft {
  name: string;
  category: string;
  keywords: string[];
  match: "any" | "all";
  replyBody: string;
  action: "reply" | "ai";
  aiKind: AiKind;
  active: boolean;
  schedule: RuleSchedule;
  cooldownMinutes: number;
}
const EMPTY_DRAFT: Draft = {
  name: "", category: "Outro", keywords: [], match: "any", replyBody: "", action: "reply", aiKind: "preco", active: true,
  schedule: { ...DEFAULT_SCHEDULE }, cooldownMinutes: 60,
};

export default function AutoRepliesTab() {
  const { rules, isLoading, create, update, remove, reorder, canManage } = useKeywordRules();
  const { data: stats } = useKeywordStats(30);
  const { data: hits = [] } = useKeywordHits(15);
  const { hours, save: saveHours } = useBusinessHours();
  const { leads } = useCRMContext();
  const { user } = useAuth();
  const store = useStoreSnapshot();
  const canEditHours = can(user?.role, "editSettings");

  // ----- simulador -----
  const [simText, setSimText] = useState("");
  const [simPhone, setSimPhone] = useState("");
  const [simAt, setSimAt] = useState("");
  const [sim, setSim] = useState<KeywordSimulation | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const runSim = async () => {
    if (!simText.trim()) { toast.error("Digite a mensagem para simular."); return; }
    setSimBusy(true);
    try {
      setSim(await api.simulateKeywordRule({
        text: simText.trim(),
        phone: simPhone.trim() || undefined,
        at: simAt ? new Date(simAt).toISOString() : undefined,
      }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível simular.");
    } finally {
      setSimBusy(false);
    }
  };

  // ----- regra (criar/editar) -----
  const [editing, setEditing] = useState<KeywordRuleView | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [kwInput, setKwInput] = useState("");
  const [testText, setTestText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<KeywordRuleView | null>(null);

  const openNew = () => { setDraft({ ...EMPTY_DRAFT, schedule: { ...DEFAULT_SCHEDULE } }); setKwInput(""); setTestText(""); setEditing("new"); };
  const openEdit = (r: KeywordRuleView) => {
    setDraft({
      name: r.name, category: r.category, keywords: [...r.keywords], match: r.match, replyBody: r.replyBody,
      action: r.action, aiKind: r.aiKind ?? "geral", active: r.active, schedule: { ...r.schedule, days: [...r.schedule.days] }, cooldownMinutes: r.cooldownMinutes,
    });
    setKwInput(""); setTestText(""); setEditing(r);
  };
  const addKeyword = () => {
    const parts = kwInput.split(",").map((k) => k.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setDraft((d) => ({ ...d, keywords: [...new Set([...d.keywords, ...parts])] }));
    setKwInput("");
  };
  const setSched = (patch: Partial<RuleSchedule>) => setDraft((d) => ({ ...d, schedule: { ...d.schedule, ...patch } }));

  const testResult = testText.trim() ? matchKeywords(testText, draft.keywords, draft.match) : null;
  const previewLead = leads[0];
  const replyPreview = renderReplyTemplate(draft.replyBody, {
    name: previewLead?.name ?? "Maria Souza", model: previewLead?.modelInterest ?? "iPhone 15 Pro",
    storeName: store.name, address: store.address, pixKey: store.pixKey,
  });

  const saveRule = async () => {
    // palavra digitada e ainda não adicionada também vale
    const pending = kwInput.split(",").map((k) => k.trim()).filter(Boolean);
    const keywords = [...new Set([...draft.keywords, ...pending])];
    if (!draft.name.trim()) { toast.error("Informe o nome da regra."); return; }
    if (keywords.length === 0) { toast.error("Adicione pelo menos uma palavra-chave."); return; }
    if (draft.action === "reply" && !draft.replyBody.trim()) { toast.error("Escreva o texto da resposta."); return; }
    const input: KeywordRuleInput = {
      name: draft.name.trim(), category: draft.category, keywords, match: draft.match, replyBody: draft.replyBody.trim(),
      action: draft.action, aiKind: draft.aiKind, active: draft.active, schedule: draft.schedule, cooldownMinutes: draft.cooldownMinutes,
    };
    try {
      if (editing === "new") await create.mutateAsync(input);
      else if (editing) await update.mutateAsync({ id: editing.id, patch: input });
      toast.success(editing === "new" ? "Regra criada." : "Regra salva.");
      setEditing(null);
    } catch {
      /* onError do hook avisa */
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const ids = rules.map((r) => r.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    reorder.mutate(ids);
  };

  // ----- horário comercial -----
  const [showHours, setShowHours] = useState(false);
  const [hoursDraft, setHoursDraft] = useState<{ open: boolean; from: string; to: string }[]>([]);
  const openHours = () => {
    setHoursDraft(Array.from({ length: 7 }, (_, day) => {
      const r = hours.ranges.find((x) => x.day === day);
      return { open: Boolean(r), from: r?.from ?? "09:00", to: r?.to ?? "19:00" };
    }));
    setShowHours(true);
  };
  const saveBusinessHours = () => {
    const bad = hoursDraft.find((d) => d.open && d.from === d.to);
    if (bad) { toast.error("O início e o fim não podem ser iguais."); return; }
    const value: BusinessHours = { ranges: hoursDraft.flatMap((d, day) => (d.open ? [{ day, from: d.from, to: d.to }] : [])) };
    saveHours.mutate(value, { onSuccess: () => setShowHours(false) });
  };

  const daily = (stats?.daily ?? []).map((d) => ({ ...d, label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}` }));
  const totalHits30 = daily.reduce((n, d) => n + d.total, 0);

  return (
    <div className="space-y-4">
      <Card className="border shadow-none">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <h3 className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-primary" /> Respostas automáticas por palavra-chave</h3>
            <p className="text-sm text-muted-foreground">
              Quando um cliente escreve no WhatsApp, a primeira regra ativa (na ordem abaixo) que casar com a mensagem e estiver dentro do horário responde sozinha.
            </p>
          </div>
          <Button variant="outline" className="gap-1" onClick={openHours}><Clock className="h-4 w-4" /> Horário comercial</Button>
          {canManage && <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Nova regra</Button>}
        </CardContent>
      </Card>

      {/* Simulador */}
      <Card className="border shadow-none" data-testid="simulator">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="h-4 w-4" /> Simular mensagem recebida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
            <Input aria-label="Mensagem simulada" placeholder="Ex.: Qual o preço do iPhone 15?" value={simText} onChange={(e) => setSimText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSim()} />
            <Input aria-label="Telefone simulado" placeholder="Telefone (opcional)" value={simPhone} onChange={(e) => setSimPhone(e.target.value)} />
            <Input aria-label="Data e hora simuladas" type="datetime-local" value={simAt} onChange={(e) => setSimAt(e.target.value)} title="Simular outro dia/horário (opcional)" />
            <Button onClick={runSim} disabled={simBusy} className="gap-1"><Send className="h-4 w-4" /> Simular</Button>
          </div>
          <p className="text-xs text-muted-foreground">Nada é enviado: é só uma simulação com as regras de hoje. O telefone serve para o nome do lead e para conferir o intervalo mínimo.</p>
          {sim && (
            <div data-testid="sim-result" data-status={sim.status} className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={sim.wouldSend ? "default" : "secondary"} data-testid="sim-verdict">
                  {sim.wouldSend ? "Responderia" : "Não responderia"}
                </Badge>
                <span>{sim.message}</span>
              </div>
              {sim.rule && (
                <div className="space-y-1">
                  <p data-testid="sim-rule"><strong>Regra:</strong> {sim.rule.name} <span className="text-muted-foreground">(prioridade {sim.rule.priority} · {sim.rule.category})</span></p>
                  <p data-testid="sim-keywords"><strong>Palavra que casou:</strong> {sim.matchedKeywords.join(", ") || "—"}</p>
                  <p data-testid="sim-schedule"><strong>Horário:</strong> {sim.scheduleOk ? "permite" : "não permite"} — {sim.scheduleReason}</p>
                </div>
              )}
              {sim.replyText && (
                <div>
                  <p className="mb-1 font-medium">Texto final</p>
                  <div data-testid="sim-reply" className="whitespace-pre-line rounded-md border bg-background p-2">{sim.replyText}</div>
                </div>
              )}
              {sim.considered.length > 1 && (
                <p className="text-xs text-muted-foreground">Também casaram (em ordem): {sim.considered.map((c) => c.name).join(" → ")}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border shadow-none" data-testid="chart-daily">
          <CardHeader className="pb-2"><CardTitle className="text-base">Disparos ao longo do tempo (30 dias)</CardTitle></CardHeader>
          <CardContent>
            {totalHits30 === 0 && <p className="mb-2 text-xs text-muted-foreground">Ainda sem disparos no período.</p>}
            <ChartContainer config={{ total: { label: "Disparos", color: "hsl(var(--primary))" }, replied: { label: "Respondidos", color: "hsl(var(--success))" } }} className="h-[200px]">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" className="text-xs" interval={4} />
                <YAxis allowDecimals={false} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="replied" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="border shadow-none" data-testid="chart-category">
          <CardHeader className="pb-2"><CardTitle className="text-base">Disparos por categoria (30 dias)</CardTitle></CardHeader>
          <CardContent>
            {(stats?.byCategory.length ?? 0) === 0 && <p className="mb-2 text-xs text-muted-foreground">Ainda sem disparos no período.</p>}
            <ChartContainer config={{ total: { label: "Disparos", color: "hsl(var(--primary))" } }} className="h-[200px]">
              <BarChart data={stats?.byCategory ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="category" className="text-xs" />
                <YAxis allowDecimals={false} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Regras */}
      <div className="space-y-2" data-testid="rule-list">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando regras…</p>}
        {!isLoading && rules.length === 0 && (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">Nenhuma regra ainda. {canManage ? "Crie a primeira em “Nova regra”." : ""}</p>
        )}
        {rules.map((r, idx) => (
          <Card key={r.id} data-testid="rule-card" data-rule={r.name} className={`border shadow-none ${r.active ? "" : "opacity-60"}`}>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold" title="Ordem de prioridade">{idx + 1}</span>
                <p className="font-medium">{r.name}</p>
                <Badge variant="outline" className="text-xs">{r.category}</Badge>
                {r.action === "ai" && <Badge variant="secondary" className="text-xs" data-testid="rule-ai-badge">IA · {AI_KIND_LABELS[r.aiKind ?? "geral"]}</Badge>}
                <div className="ml-auto flex items-center gap-1">
                  {canManage && (
                    <>
                      <Switch checked={r.active} aria-label={`Ligar regra ${r.name}`} onCheckedChange={(v) => update.mutate({ id: r.id, patch: { active: v } })} />
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Subir ${r.name}`} disabled={idx === 0} onClick={() => move(idx, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Descer ${r.name}`} disabled={idx === rules.length - 1} onClick={() => move(idx, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar ${r.name}`} onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Excluir ${r.name}`} onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {r.keywords.map((k) => <Badge key={k} variant="secondary" className="text-xs font-normal">{k}</Badge>)}
                <span className="text-xs text-muted-foreground">({r.match === "all" ? "todas" : "qualquer uma"})</span>
              </div>
              <p className="text-xs text-muted-foreground">{scheduleSummary(r.schedule)} · intervalo mínimo {r.cooldownMinutes} min</p>
              <p className="text-xs" data-testid="rule-stats">
                <strong>{r.stats.total}</strong> disparo(s) · último: {dm(r.stats.lastAt)} · respostas enviadas: <strong>{Math.round(r.stats.rate * 100)}%</strong>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Últimos disparos */}
      {hits.length > 0 && (
        <Card className="border shadow-none" data-testid="hits">
          <CardHeader className="pb-2"><CardTitle className="text-base">Últimos disparos</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {hits.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-2 border-b py-1 last:border-0">
                <span className="text-xs text-muted-foreground">{dm(h.createdAt)}</span>
                <span className="font-medium">{h.ruleName}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">“{h.inboundText}”</span>
                <Badge variant={h.replied ? "default" : h.error ? "destructive" : "secondary"} className="text-xs" title={h.error ?? ""} data-testid="hit-status">
                  {h.replied ? "Respondeu" : h.error ? "Falhou" : h.reviewId ? "Na revisão da IA" : "Enviando"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Criar / editar regra */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === "new" ? "Nova regra de resposta automática" : "Editar regra"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <Label htmlFor="kr-name">Nome da regra</Label>
                <Input id="kr-name" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Perguntas sobre preço" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                  <SelectTrigger aria-label="Categoria da regra"><SelectValue /></SelectTrigger>
                  <SelectContent>{RULE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="kr-kw">Palavras-chave</Label>
                <div className="flex gap-2">
                  <Input id="kr-kw" aria-label="Nova palavra-chave" value={kwInput} onChange={(e) => setKwInput(e.target.value)} placeholder="Digite e tecle Enter (ou separe por vírgula)"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }} />
                  <Button type="button" variant="outline" onClick={addKeyword}>Adicionar</Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1" data-testid="kw-chips">
                  {draft.keywords.map((k) => (
                    <Badge key={k} variant="secondary" className="gap-1 font-normal">
                      {k}
                      <button type="button" aria-label={`Remover palavra ${k}`} onClick={() => setDraft({ ...draft, keywords: draft.keywords.filter((x) => x !== k) })}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Casa a palavra inteira, sem diferenciar acento ou maiúsculas. Use <code>*</code> para parte da palavra: <code>garant*</code> casa garantia e garantido.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Casar</Label>
                  <Select value={draft.match} onValueChange={(v) => setDraft({ ...draft, match: v as "any" | "all" })}>
                    <SelectTrigger aria-label="Modo de casamento"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer palavra</SelectItem>
                      <SelectItem value="all">Todas as palavras</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ação</Label>
                  <Select value={draft.action} onValueChange={(v) => setDraft({ ...draft, action: v as "reply" | "ai" })}>
                    <SelectTrigger aria-label="Ação da regra"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reply">Responder com o texto</SelectItem>
                      <SelectItem value="ai">Responder com IA (Gemini)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.action === "ai" && (
                  <div className="col-span-2">
                    <Label>Tipo de atendimento da IA</Label>
                    <Select value={draft.aiKind} onValueChange={(v) => setDraft({ ...draft, aiKind: v as AiKind })}>
                      <SelectTrigger aria-label="Tipo de atendimento da IA"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AI_KINDS.map((k) => <SelectItem key={k} value={k}>{AI_KIND_LABELS[k]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground" data-testid="rule-ai-hint">
                      A resposta é gerada pelo Gemini na hora (com a base de conhecimento, o estoque e os guardrails). Ela só sai sozinha se o envio automático estiver ligado e a confiança for alta; senão vai para a aba <strong>Revisão da IA</strong>. O texto abaixo não é usado.
                    </p>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="kr-test">Testar palavras-chave</Label>
                <Input id="kr-test" aria-label="Testar mensagem na regra" value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="Digite uma mensagem de cliente para testar" />
                {testResult && (
                  <p data-testid="kr-test-result" className={`mt-1 text-xs ${testResult.matched ? "text-success" : "text-muted-foreground"}`}>
                    {testResult.matched ? `Casa (${testResult.matchedKeywords.join(", ")})` : "Não casa com esta regra"}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="kr-body">Texto da resposta</Label>
                <Textarea id="kr-body" value={draft.replyBody} rows={5} maxLength={1000} onChange={(e) => setDraft({ ...draft, replyBody: e.target.value })} placeholder="Olá, {primeiro_nome}! ..." />
                <div className="mt-1 flex flex-wrap gap-1">
                  {REPLY_VARIABLES.map((v) => (
                    <button key={v.key} type="button" title={v.description} className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                      onClick={() => setDraft((d) => ({ ...d, replyBody: `${d.replyBody}{${v.key}}` }))}>{`{${v.key}}`}</button>
                  ))}
                </div>
                <div data-testid="kr-preview" className="mt-2 min-h-[64px] whitespace-pre-line rounded-lg border bg-muted/40 p-2 text-sm">
                  {replyPreview || <span className="text-muted-foreground">Prévia do texto aparece aqui.</span>}
                </div>
              </div>
              <div>
                <Label>Quando responder</Label>
                <Select value={draft.schedule.mode} onValueChange={(v) => setSched({ mode: v as RuleMode })}>
                  <SelectTrigger aria-label="Quando responder"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(MODE_LABELS) as RuleMode[]).map((m) => <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {draft.schedule.mode === "window" && (
                <div className="space-y-2 rounded-lg border p-2">
                  <div className="flex flex-wrap gap-1">
                    {DAY_NAMES.map((n, d) => {
                      const on = draft.schedule.days.includes(d);
                      return (
                        <Button key={n} type="button" size="sm" variant={on ? "default" : "outline"} className="h-7 px-2" aria-label={`Dia ${n}`} aria-pressed={on}
                          onClick={() => setSched({ days: on ? draft.schedule.days.filter((x) => x !== d) : [...draft.schedule.days, d].sort() })}>{n}</Button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Das</Label><Input aria-label="Janela: início" type="time" value={draft.schedule.from} onChange={(e) => setSched({ from: e.target.value })} /></div>
                    <div><Label className="text-xs">Até</Label><Input aria-label="Janela: fim" type="time" value={draft.schedule.to} onChange={(e) => setSched({ to: e.target.value })} /></div>
                  </div>
                </div>
              )}
              <div>
                <Label>Período de campanha (opcional)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input aria-label="Campanha: início" type="date" value={draft.schedule.startDate ?? ""} onChange={(e) => setSched({ startDate: e.target.value || null })} />
                  <Input aria-label="Campanha: fim" type="date" value={draft.schedule.endDate ?? ""} onChange={(e) => setSched({ endDate: e.target.value || null })} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Ex.: Black Friday, Natal, feriado. Fora do período a regra não responde.</p>
              </div>
              <div>
                <Label htmlFor="kr-cool">Intervalo mínimo entre respostas ao mesmo cliente (minutos)</Label>
                <Input id="kr-cool" type="number" min={0} max={10080} value={draft.cooldownMinutes}
                  onChange={(e) => setDraft({ ...draft, cooldownMinutes: Number(e.target.value) })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="kr-active" checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} aria-label="Regra ativa" />
                <Label htmlFor="kr-active">Regra ativa</Label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveRule} disabled={create.isPending || update.isPending}>Salvar regra</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Horário comercial */}
      <Dialog open={showHours} onOpenChange={setShowHours}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Horário comercial</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Usado pelas regras “só no horário comercial” e “só fora do horário comercial”. Fuso: São Paulo.</p>
            {hoursDraft.map((d, day) => (
              <div key={day} className="flex items-center gap-2">
                <Switch checked={d.open} disabled={!canEditHours} aria-label={`Aberto ${DAY_NAMES[day]}`}
                  onCheckedChange={(v) => setHoursDraft(hoursDraft.map((x, i) => (i === day ? { ...x, open: v } : x)))} />
                <span className="w-10 text-sm">{DAY_NAMES[day]}</span>
                <Input type="time" className="w-28" aria-label={`Abre ${DAY_NAMES[day]}`} disabled={!d.open || !canEditHours} value={d.from}
                  onChange={(e) => setHoursDraft(hoursDraft.map((x, i) => (i === day ? { ...x, from: e.target.value } : x)))} />
                <span className="text-sm text-muted-foreground">às</span>
                <Input type="time" className="w-28" aria-label={`Fecha ${DAY_NAMES[day]}`} disabled={!d.open || !canEditHours} value={d.to}
                  onChange={(e) => setHoursDraft(hoursDraft.map((x, i) => (i === day ? { ...x, to: e.target.value } : x)))} />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowHours(false)}>{canEditHours ? "Cancelar" : "Fechar"}</Button>
              {canEditHours && <Button onClick={saveBusinessHours} disabled={saveHours.isPending}>Salvar horário</Button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget && <>Excluir <strong>{deleteTarget.name}</strong> e o histórico de disparos dela? Esta ação não pode ser desfeita.</>}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) remove.mutate(deleteTarget.id, { onSuccess: () => toast.success("Regra excluída.") }); setDeleteTarget(null); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
