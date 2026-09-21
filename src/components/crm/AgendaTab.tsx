import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Cake, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, MessageCircle,
  Receipt, Settings2, ShieldCheck, ShoppingBag,
} from "lucide-react";
import { useCRMContext } from "@/contexts/CRMContext";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuotes } from "@/hooks/useQuotes";
import { useAgendaConfig } from "@/hooks/useCRMExtras";
import { useStoreSnapshot } from "@/hooks/useAppSettings";
import { can } from "@/lib/permissions";
import { api, ApiError } from "@/lib/api";
import { whatsappLink } from "@/lib/quotes";
import { weekStartOf } from "@/lib/planning";
import {
  AGENDA_GROUP_LABELS, AGENDA_GROUP_ORDER, addDaysYmd, brDate, brDay, buildAgenda, dueIso, filterByOwner,
  groupAgenda, rescheduleDate, spDate, weekOf,
  type AgendaConfig, type AgendaItem, type AgendaKind, type OwnerFilter,
} from "@/lib/agenda";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const KIND_META: Record<AgendaKind, { label: string; icon: typeof Cake }> = {
  task: { label: "Tarefa", icon: ClipboardList },
  birthday: { label: "Aniversário", icon: Cake },
  purchase: { label: "Pós-venda", icon: ShoppingBag },
  quote: { label: "Orçamento", icon: Receipt },
  warranty: { label: "Garantia", icon: ShieldCheck },
};

type DateAction = { item: AgendaItem; mode: "reschedule" | "create" };

export default function AgendaTab() {
  const { leads, leadTasks, messageLogs, toggleLeadTask } = useCRMContext();
  const { customers, sales } = useInventoryContext();
  const { quotes } = useQuotes(true);
  const { user } = useAuth();
  const store = useStoreSnapshot();
  const { config, save: saveConfig } = useAgendaConfig();
  const qc = useQueryClient();
  const canConfig = can(user?.role, "editSettings");

  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [view, setView] = useState<"lista" | "semana">("lista");
  const [showDone, setShowDone] = useState(false);
  const [weekStart, setWeekStart] = useState(() => weekStartOf(spDate(new Date())));
  const [dateAction, setDateAction] = useState<DateAction | null>(null);
  const [pickedDate, setPickedDate] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [cfgDraft, setCfgDraft] = useState<AgendaConfig>(config);
  const [busy, setBusy] = useState<string | null>(null);

  const now = new Date();
  const today = spDate(now);
  const all = useMemo(
    () => buildAgenda({ now, config, tasks: leadTasks, leads, customers, sales, quotes, messageLogs, storeName: store.name }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leadTasks, leads, customers, sales, quotes, messageLogs, config, store.name, today]
  );
  const owners = useMemo(() => [...new Set(all.map((i) => i.ownerName).filter((n): n is string => Boolean(n)))], [all]);
  const items = filterByOwner(all, owner, { id: user?.id, name: user?.name });
  const groups = groupAgenda(items, now, showDone);
  const week = weekOf(items, weekStart, showDone);
  const totalOpen = items.filter((i) => !i.done).length;

  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["leadTasks"] }), qc.invalidateQueries({ queryKey: ["leads"] })]);
  };
  const fail = (e: unknown, fb: string) => toast.error(e instanceof ApiError ? e.message : fb);

  const openWhatsapp = (it: AgendaItem) => {
    if (!it.phone) { toast.error("Sem WhatsApp cadastrado para este contato."); return; }
    window.open(whatsappLink(it.phone, it.message), "_blank", "noopener");
  };

  const complete = async (it: AgendaItem) => {
    setBusy(it.key);
    try {
      if (it.kind === "task" && it.taskId) {
        toggleLeadTask(it.taskId, !it.done);
      } else {
        // sugestão: registra "contato feito" (tarefa concluída) e a sugestão some
        await api.createTaskFromContact({
          contact: { name: it.name, phone: it.phone, origin: "Cliente", stage: it.stage },
          title: `Contato feito: ${it.title}`, dueDate: dueIso(today), sourceKey: it.key, done: true,
        });
        await refresh();
        toast.success("Registrado como contato feito.");
      }
    } catch (e) {
      fail(e, "Não foi possível concluir.");
    } finally {
      setBusy(null);
    }
  };

  const applyDate = async (it: AgendaItem, mode: DateAction["mode"], ymd: string) => {
    setBusy(it.key);
    try {
      if (mode === "reschedule" && it.taskId) {
        await api.updateLeadTask(it.taskId, { dueDate: dueIso(ymd) });
        await refresh();
        toast.success(`Tarefa reagendada para ${brDate(ymd)}.`);
      } else {
        if (!it.phone) { toast.error("Este contato não tem WhatsApp/telefone cadastrado."); return; }
        const r = await api.createTaskFromContact({
          contact: { name: it.name, phone: it.phone, origin: "Cliente", stage: it.stage },
          title: `Follow-up: ${it.title}`, dueDate: dueIso(ymd), sourceKey: it.key,
        });
        await refresh();
        toast.success(r.leadCreated ? `Tarefa criada para ${brDate(ymd)} (lead criado no funil).` : `Tarefa criada para ${brDate(ymd)}.`);
      }
    } catch (e) {
      fail(e, "Não foi possível salvar.");
    } finally {
      setBusy(null);
    }
  };

  const pickQuick = (it: AgendaItem, mode: DateAction["mode"], kind: "today" | "tomorrow" | "week") =>
    applyDate(it, mode, rescheduleDate(kind, now));

  // (chamadas como função, não como componente: o menu aberto não perde o estado quando a tela atualiza)
  const DateMenu = ({ it, mode }: { it: AgendaItem; mode: DateAction["mode"] }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm" variant="outline" className="h-8 gap-1" disabled={busy === it.key}
          aria-label={mode === "reschedule" ? "Reagendar" : "Criar tarefa da sugestão"}
        >
          <CalendarClock className="h-3.5 w-3.5" /> {mode === "reschedule" ? "Reagendar" : "Criar tarefa"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => pickQuick(it, mode, "today")}>Hoje</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => pickQuick(it, mode, "tomorrow")}>Amanhã</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => pickQuick(it, mode, "week")}>Daqui a 7 dias</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { setPickedDate(it.date && it.date >= today ? it.date : today); setDateAction({ item: it, mode }); }}>
          Escolher data…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const Row = ({ it, compact = false }: { it: AgendaItem; compact?: boolean }) => {
    const meta = KIND_META[it.kind];
    const Icon = meta.icon;
    const late = it.date !== null && it.date < today && !it.done;
    return (
      <div
        key={it.key}
        data-testid="agenda-item" data-kind={it.kind} data-key={it.key}
        className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${it.done ? "opacity-60" : ""}`}
      >
        <button
          type="button"
          aria-label={it.kind === "task" ? (it.done ? "Reabrir tarefa" : "Concluir tarefa") : "Marcar contato como feito"}
          title={it.kind === "task" ? "Concluir" : "Já entrei em contato"}
          disabled={busy === it.key}
          onClick={() => complete(it)}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${it.done ? "bg-success text-success-foreground" : ""}`}
        >
          {it.done && <Check className="h-3.5 w-3.5" />}
        </button>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-[160px] flex-1">
          <p className={`font-medium ${it.done ? "line-through" : ""}`}>{it.title}</p>
          <p className={`text-xs ${late ? "text-destructive" : "text-muted-foreground"}`}>
            {it.detail}{it.kind === "task" && it.date ? ` · ${brDay(it.date)}` : ""}{it.ownerName ? ` · ${it.ownerName}` : ""}
          </p>
        </div>
        <Badge variant={it.kind === "task" ? "secondary" : "outline"} className="text-[10px]">
          {it.kind === "task" ? meta.label : `Sugestão · ${meta.label}`}
        </Badge>
        {!compact && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Abrir WhatsApp" title="Abrir conversa no WhatsApp" onClick={() => openWhatsapp(it)}>
              <MessageCircle className="h-4 w-4" />
            </Button>
            {!it.done && DateMenu({ it, mode: it.kind === "task" ? "reschedule" : "create" })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="border shadow-none">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-[200px] flex-1">
            <h3 className="font-semibold">Agenda de follow-up</h3>
            <p className="text-sm text-muted-foreground" data-testid="agenda-summary">
              {totalOpen} item(ns) em aberto · tarefas dos leads e sugestões automáticas de contato com clientes.
            </p>
          </div>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="w-44" aria-label="Filtrar agenda por responsável"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="mine">Minhas</SelectItem>
              {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border p-0.5" role="group" aria-label="Visão da agenda">
            <Button size="sm" variant={view === "lista" ? "default" : "ghost"} className="h-7 gap-1" onClick={() => setView("lista")}>
              <ClipboardList className="h-3.5 w-3.5" /> Por grupo
            </Button>
            <Button size="sm" variant={view === "semana" ? "default" : "ghost"} className="h-7 gap-1" onClick={() => setView("semana")}>
              <CalendarDays className="h-3.5 w-3.5" /> Semana
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="agenda-done" checked={showDone} onCheckedChange={setShowDone} aria-label="Mostrar concluídas" />
            <Label htmlFor="agenda-done" className="text-sm">Concluídas</Label>
          </div>
          {canConfig && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => { setCfgDraft(config); setShowConfig(true); }}>
              <Settings2 className="h-4 w-4" /> Sugestões
            </Button>
          )}
        </CardContent>
      </Card>

      {view === "lista" ? (
        <div className="space-y-4">
          {AGENDA_GROUP_ORDER.map((g) => {
            const list = groups[g];
            if (list.length === 0 && g !== "overdue" && g !== "today") return null;
            return (
              <section key={g} data-testid={`agenda-group-${g}`} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm font-semibold ${g === "overdue" ? "text-destructive" : ""}`}>{AGENDA_GROUP_LABELS[g]}</h4>
                  <Badge variant="secondary" className="text-xs">{list.length}</Badge>
                </div>
                {list.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">Nada por aqui.</p>
                ) : (
                  <div className="space-y-2">{list.map((it) => Row({ it }))}</div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Semana anterior" onClick={() => setWeekStart(addDaysYmd(weekStart, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium" data-testid="agenda-week-label">{brDay(weekStart)} a {brDate(addDaysYmd(weekStart, 6))}</span>
            <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Próxima semana" onClick={() => setWeekStart(addDaysYmd(weekStart, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setWeekStart(weekStartOf(today))}>Hoje</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-7">
            {week.map((d, i) => (
              <div key={d.date} data-testid={`agenda-day-${d.date}`} className={`rounded-lg border p-2 ${d.date === today ? "border-primary bg-primary/5" : ""}`}>
                <p className="mb-2 text-xs font-semibold">
                  {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][i]} {brDay(d.date)}
                </p>
                <div className="space-y-1.5">
                  {d.items.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
                  {d.items.map((it) => Row({ it, compact: true }))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Escolher data (reagendar / criar tarefa) */}
      <Dialog open={!!dateAction} onOpenChange={(o) => !o && setDateAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{dateAction?.mode === "reschedule" ? "Reagendar tarefa" : "Criar tarefa de follow-up"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{dateAction?.item.title}</p>
            <div>
              <Label htmlFor="agenda-date">Data</Label>
              <Input id="agenda-date" type="date" value={pickedDate} onChange={(e) => setPickedDate(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDateAction(null)}>Cancelar</Button>
              <Button
                disabled={!pickedDate}
                onClick={() => { if (dateAction) applyDate(dateAction.item, dateAction.mode, pickedDate); setDateAction(null); }}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Configurar sugestões */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Sugestões automáticas da agenda</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {([
              ["purchaseDays", "Cliente sem contato após a compra (dias)"],
              ["quoteDays", "Orçamento enviado sem resposta (dias)"],
              ["warrantyDays", "Garantia vencendo nos próximos (dias)"],
              ["purchaseMaxDays", "Não sugerir compras mais antigas que (dias)"],
            ] as [keyof AgendaConfig, string][]).map(([k, label]) => (
              <div key={k}>
                <Label htmlFor={`cfg-${k}`}>{label}</Label>
                <Input
                  id={`cfg-${k}`} type="number" min={1}
                  value={cfgDraft[k]}
                  onChange={(e) => setCfgDraft({ ...cfgDraft, [k]: Number(e.target.value) })}
                />
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowConfig(false)}>Cancelar</Button>
              <Button
                onClick={() => {
                  const ok = (Object.values(cfgDraft) as number[]).every((n) => Number.isInteger(n) && n >= 1);
                  if (!ok) { toast.error("Use números inteiros a partir de 1."); return; }
                  saveConfig.mutate(cfgDraft, { onSuccess: () => setShowConfig(false) });
                }}
              >
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
