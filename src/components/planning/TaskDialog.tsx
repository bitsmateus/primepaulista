import { useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PlanningTaskInput } from "@/lib/api";
import { DEFAULT_REMINDER_TEMPLATE, WEEKDAY_NAMES, dayLabel, renderReminder } from "@/lib/planning";
import { fromLocalInput, toLocalInput, type PlanningTask } from "@/lib/planningView";
import { getStoreSettings } from "@/lib/storeSettings";

export interface Assignee {
  id: string;
  name: string;
  hasPhone: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  weekStart: string;
  defaultWeekday: number;
  task: PlanningTask | null; // null = nova tarefa
  assignees: Assignee[];
  saving: boolean;
  onSave: (input: PlanningTaskInput) => void;
  onRemindNow?: (task: PlanningTask) => void;
}

const NONE = "none";

// Criar / editar tarefa. "Salvar e Lembrar Colaborador": com responsável e lembrete ligado,
// o colaborador é avisado no sistema (no horário) e por WhatsApp (se tiver telefone).
export function TaskDialog({ open, onOpenChange, weekStart, defaultWeekday, task, assignees, saving, onSave, onRemindNow }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [weekday, setWeekday] = useState(0);
  const [assigneeId, setAssigneeId] = useState<string>(NONE);
  const [remind, setRemind] = useState(false);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [whenValue, setWhenValue] = useState("");
  const [message, setMessage] = useState(DEFAULT_REMINDER_TEMPLATE);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setWeekday(task?.weekday ?? defaultWeekday);
    setAssigneeId(task?.assigneeId ?? NONE);
    const hasRemind = !!task?.remindAt;
    setRemind(hasRemind);
    setWhen(hasRemind ? "later" : "now");
    setWhenValue(toLocalInput(task?.remindAt ?? null));
    setMessage(task?.reminderMessage || DEFAULT_REMINDER_TEMPLATE);
  }, [open, task, defaultWeekday]);

  const assignee = assignees.find((a) => a.id === assigneeId);
  const canRemind = !!assignee;
  const remindOn = remind && canRemind;

  const preview = useMemo(
    () => renderReminder(message, { assigneeName: assignee?.name ?? "", title: title.trim() || "(título da tarefa)", weekStart, weekday, storeName: getStoreSettings().name }),
    [message, assignee, title, weekStart, weekday]
  );

  // Horário do lembrete não mexido: reenvia o valor original (evita "reiniciar" o lembrete sem querer)
  const whenUnchanged = !!task?.remindAt && when === "later" && whenValue === toLocalInput(task.remindAt);
  const whenIso = remindOn
    ? when === "now"
      ? new Date().toISOString()
      : whenUnchanged
        ? task!.remindAt!.toISOString()
        : fromLocalInput(whenValue)
    : null;
  const invalid = !title.trim() || (remindOn && when === "later" && !whenIso);

  const submit = () => {
    onSave({
      weekStart,
      weekday,
      title: title.trim(),
      description: description.trim(),
      assigneeId: assigneeId === NONE ? null : assigneeId,
      remindAt: whenIso,
      reminderMessage: remindOn ? message.trim() : "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription>{dayLabel(weekStart, weekday)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="task-title">Título</Label>
            <Input id="task-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Conferir a vitrine" />
          </div>
          <div>
            <Label htmlFor="task-desc">Descrição (opcional)</Label>
            <Textarea id="task-desc" rows={2} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Dia</Label>
              <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))}>
                <SelectTrigger aria-label="Dia da tarefa"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAY_NAMES.map((n, i) => <SelectItem key={n} value={String(i)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsável</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger aria-label="Responsável pela tarefa"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem responsável</SelectItem>
                  {assignees.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {canRemind && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="task-remind" className="flex items-center gap-2"><BellRing className="h-4 w-4" /> Lembrar o colaborador</Label>
                <Switch id="task-remind" aria-label="Lembrar o colaborador" checked={remind} onCheckedChange={setRemind} />
              </div>
              {remindOn && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Quando</Label>
                      <Select value={when} onValueChange={(v) => setWhen(v as "now" | "later")}>
                        <SelectTrigger aria-label="Quando lembrar"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="now">Agora (ao salvar)</SelectItem>
                          <SelectItem value="later">Em data e hora</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {when === "later" && (
                      <div>
                        <Label htmlFor="task-when">Data e hora</Label>
                        <Input id="task-when" type="datetime-local" value={whenValue} onChange={(e) => setWhenValue(e.target.value)} />
                      </div>
                    )}
                  </div>
                  {assignee && !assignee.hasPhone && (
                    <p className="text-xs text-amber-700" data-testid="no-phone-warning">
                      {assignee.name} não tem WhatsApp cadastrado (Usuários): o lembrete chegará só no sistema.
                    </p>
                  )}
                  <div>
                    <Label htmlFor="task-msg">Mensagem que será enviada (WhatsApp)</Label>
                    <Textarea id="task-msg" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
                    <p className="mt-1 text-xs text-muted-foreground">Variáveis: {"{nome}"} {"{tarefa}"} {"{dia}"} {"{loja}"}</p>
                    <div className="mt-2 rounded-md bg-muted/60 p-2 text-sm" data-testid="msg-preview">{preview}</div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {task && task.assigneeId && onRemindNow && (
            <Button type="button" variant="outline" className="mr-auto" onClick={() => onRemindNow(task)} disabled={saving}>
              <BellRing className="mr-1 h-4 w-4" /> Lembrar agora
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={saving || invalid}>
            {remindOn ? "Salvar e Lembrar Colaborador" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
