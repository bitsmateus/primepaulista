import { useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, ChevronLeft, ChevronRight, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { TaskDialog } from "@/components/planning/TaskDialog";
import { api, ApiError, type PlanningTaskInput, type WhatsappOutcome } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";
import { WEEKDAY_NAMES } from "@/lib/planning";
import {
  currentWeekStart, dayMonth, groupByWeekday, onlyMine, reminderLabel, shiftWeek, toYmd, weekDates, weekRangeLabel, weekSummary, weekdayShort,
  type PlanningTask,
} from "@/lib/planningView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function whatsappToast(w: WhatsappOutcome | null) {
  if (!w) return;
  if (w.status === "sent") toast.success("Lembrete enviado por WhatsApp.");
  else if (w.status === "no_phone") toast.info("Tarefa salva. O colaborador não tem WhatsApp cadastrado: o lembrete chegará só no sistema.");
  else if (w.status === "no_instance") toast.warning(`Tarefa salva, mas o WhatsApp não foi enviado: ${w.error ?? "indisponível"}`);
  else toast.warning(`Tarefa salva, mas o WhatsApp falhou: ${w.error ?? "erro do provedor"}`);
}

export default function PlanningPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => currentWeekStart());
  const [mineOnly, setMineOnly] = useState(false);
  const [dialog, setDialog] = useState<{ task: PlanningTask | null; weekday: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlanningTask | null>(null);

  const canManage = can(user?.role, "managePlanning");
  const key = ["planning", weekStart];

  const { data, isLoading, isError } = useQuery({ queryKey: key, queryFn: () => api.listPlanningTasks(weekStart) });
  const { data: assignees = [] } = useQuery({ queryKey: ["planningAssignees"], queryFn: api.planningAssignees, enabled: canManage, staleTime: 60_000 });

  const all = data?.tasks ?? [];
  const shown = mineOnly ? onlyMine(all, user?.id) : all;
  const cols = useMemo(() => groupByWeekday(shown), [shown]);
  const summary = weekSummary(shown);
  const dates = weekDates(weekStart);
  const today = toYmd(new Date());
  const isThisWeek = weekStart === currentWeekStart();

  const refresh = () => qc.invalidateQueries({ queryKey: ["planning"] });
  const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Não foi possível salvar.");

  const saveMut = useMutation({
    mutationFn: (v: { id?: string; input: PlanningTaskInput }) => (v.id ? api.updatePlanningTask(v.id, v.input) : api.createPlanningTask(v.input)),
    onSuccess: (r, v) => {
      refresh();
      setDialog(null);
      toast.success(v.id ? "Tarefa atualizada." : "Tarefa criada.");
      whatsappToast(r.whatsapp);
    },
    onError: fail,
  });

  const doneMut = useMutation({
    mutationFn: (v: { id: string; done: boolean }) => api.updatePlanningTask(v.id, { done: v.done }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<typeof data>(key);
      qc.setQueryData(key, (d: typeof data) => d && { ...d, tasks: d.tasks.map((t) => (t.id === v.id ? { ...t, done: v.done } : t)) });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      fail(e);
    },
    onSettled: refresh,
  });

  const moveMut = useMutation({
    mutationFn: (v: { id: string; weekday: number }) => api.updatePlanningTask(v.id, { weekday: v.weekday }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<typeof data>(key);
      qc.setQueryData(key, (d: typeof data) => d && { ...d, tasks: d.tasks.map((t) => (t.id === v.id ? { ...t, weekday: v.weekday } : t)) });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      fail(e);
    },
    onSettled: refresh,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.deletePlanningTask(id),
    onSuccess: () => {
      refresh();
      setDeleteTarget(null);
      toast.success("Tarefa excluída.");
    },
    onError: fail,
  });

  const remindMut = useMutation({
    mutationFn: (id: string) => api.remindPlanningTask(id),
    onSuccess: (r) => {
      refresh();
      setDialog(null);
      toast.success("Colaborador lembrado.");
      whatsappToast(r.whatsapp);
    },
    onError: fail,
  });

  const onDragEnd = (r: DropResult) => {
    if (!r.destination || !canManage) return;
    const to = Number(r.destination.droppableId.replace("day-", ""));
    const from = Number(r.source.droppableId.replace("day-", ""));
    if (Number.isNaN(to) || to === from) return;
    moveMut.mutate({ id: r.draggableId, weekday: to });
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Planejamento semanal</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {canManage ? "Distribua as tarefas da semana e lembre os colaboradores." : "Suas tarefas da semana. Marque como feita ao concluir."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
              <Switch id="mine-only" aria-label="Minhas tarefas" checked={mineOnly} onCheckedChange={setMineOnly} />
              <Label htmlFor="mine-only" className="text-sm">Minhas tarefas</Label>
            </div>
            {canManage && (
              <Button onClick={() => setDialog({ task: null, weekday: Math.min(6, Math.max(0, dates.indexOf(today) === -1 ? 0 : dates.indexOf(today))) })}>
                <Plus className="mr-1 h-4 w-4" /> Nova tarefa
              </Button>
            )}
          </div>
        </div>

        {/* Navegação de semanas + resumo */}
        <Card className="border shadow-none">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" aria-label="Ir para hoje" disabled={isThisWeek} onClick={() => setWeekStart(currentWeekStart())}>Hoje</Button>
              <Button variant="outline" size="icon" aria-label="Próxima semana" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}><ChevronRight className="h-4 w-4" /></Button>
              <span className="ml-2 text-sm font-medium" data-testid="week-label">{weekRangeLabel(weekStart)}</span>
              {isThisWeek && <Badge variant="secondary">Esta semana</Badge>}
            </div>
            <div className="min-w-[220px] flex-1 sm:max-w-sm" data-testid="week-summary">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>{summary.total} tarefa{summary.total === 1 ? "" : "s"} · {summary.done} concluída{summary.done === 1 ? "" : "s"}</span>
                <span>{summary.percent}%</span>
              </div>
              <Progress value={summary.percent} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {isError && <p className="text-sm text-destructive">Não foi possível carregar o planejamento.</p>}

        {/* Quadro */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {dates.map((ymd, i) => {
              const list = cols[i];
              const isToday = ymd === today;
              return (
                <div key={ymd} className="w-[230px] flex-shrink-0" data-testid={`plan-col-${i}`}>
                  <div className={`mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 ${isToday ? "bg-primary/10" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight" title={WEEKDAY_NAMES[i]}>{weekdayShort(i)}</p>
                      <p className="text-xs text-muted-foreground">{dayMonth(ymd)}{isToday ? " · hoje" : ""}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">{list.length}</Badge>
                    {canManage && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Nova tarefa na ${WEEKDAY_NAMES[i]}`} onClick={() => setDialog({ task: null, weekday: i })}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Droppable droppableId={`day-${i}`} isDropDisabled={!canManage}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-[260px] space-y-2 rounded-lg border-2 border-dashed p-2 transition-colors ${snapshot.isDraggingOver ? "border-primary/50 bg-primary/5" : "border-border bg-muted/30"}`}
                      >
                        {list.map((t, index) => {
                          const canToggle = canManage || t.assigneeId === user?.id;
                          const rem = reminderLabel(t);
                          return (
                            <Draggable key={t.id} draggableId={t.id} index={index} isDragDisabled={!canManage}>
                              {(p, s) => (
                                <Card
                                  ref={p.innerRef}
                                  {...p.draggableProps}
                                  data-testid="plan-task"
                                  data-task-id={t.id}
                                  data-done={t.done}
                                  className={`border shadow-sm ${s.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""} ${t.done ? "opacity-70" : ""}`}
                                >
                                  <CardContent className="p-2.5">
                                    <div className="flex items-start gap-2">
                                      {canManage && (
                                        <div {...p.dragHandleProps} className="mt-0.5 cursor-grab text-muted-foreground" aria-label={`Arrastar tarefa ${t.title}`}>
                                          <GripVertical className="h-4 w-4" />
                                        </div>
                                      )}
                                      <Checkbox
                                        className="mt-0.5"
                                        aria-label={`Concluir ${t.title}`}
                                        checked={t.done}
                                        disabled={!canToggle || doneMut.isPending}
                                        onCheckedChange={(v) => doneMut.mutate({ id: t.id, done: v === true })}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className={`text-sm font-medium leading-snug ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.title}</p>
                                        {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
                                        <div className="mt-1 flex flex-wrap items-center gap-1">
                                          {t.assigneeName ? (
                                            <Badge variant="outline" className="h-5 text-[10px]" data-testid="plan-assignee">{t.assigneeName}</Badge>
                                          ) : (
                                            <span className="text-[10px] text-muted-foreground">Sem responsável</span>
                                          )}
                                          {rem && (
                                            <Badge variant="secondary" className="h-5 gap-1 text-[10px]" data-testid="plan-reminder">
                                              <BellRing className="h-3 w-3" /> {rem}
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    {canManage && (
                                      <div className="mt-1.5 flex justify-end gap-1 border-t pt-1.5">
                                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" aria-label={`Editar ${t.title}`} onClick={() => setDialog({ task: t, weekday: t.weekday })}>
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Excluir" aria-label={`Excluir ${t.title}`} onClick={() => setDeleteTarget(t)}>
                                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                        {!isLoading && list.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted-foreground">Sem tarefas</p>}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      <TaskDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        weekStart={weekStart}
        defaultWeekday={dialog?.weekday ?? 0}
        task={dialog?.task ?? null}
        assignees={assignees}
        saving={saveMut.isPending || remindMut.isPending}
        onSave={(input) => saveMut.mutate({ id: dialog?.task?.id, input })}
        onRemindNow={(t) => remindMut.mutate(t.id)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget && `"${deleteTarget.title}" será removida do planejamento. A exclusão fica registrada na Auditoria.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && delMut.mutate(deleteTarget.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
