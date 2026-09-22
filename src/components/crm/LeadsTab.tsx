import { useState } from "react";
import { Plus, Search, Trash2, MessageCircle, History, Settings2, X, GripVertical, Pencil, ShoppingBag, ListChecks, BarChart3, Check, ArrowUp, ArrowDown, RotateCcw, Inbox } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useCRMContext } from "@/contexts/CRMContext";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import { formatPhoneInput, leadMatchesSearch, buildFunnelSummary, leadHasPurchased, buildFunnelMetrics, pendingTasksToday } from "@/lib/crm";
import { Lead } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import QuickReplyPicker from "@/components/crm/QuickReplyPicker";
import AiSuggestPanel from "@/components/ai/AiSuggestPanel";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";

const ORIGINS = ["Instagram", "Indicação", "Tráfego Pago", "WhatsApp", "Site", "Outro"];

const COLUMN_COLORS = [
  "211 100% 45%", "38 92% 50%", "25 95% 53%", "160 84% 39%",
  "0 84% 60%", "270 70% 55%", "190 80% 42%", "330 80% 55%",
];

export default function LeadsTab() {
  const {
    leads, leadsLoading, addLead, updateLead, deleteLead, moveLeadInColumn,
    sendMessage, addMessageLog, getLogsForRecipient, connectionStatus,
    funnelColumns, columnsLoading, addFunnelColumn, removeFunnelColumn, updateFunnelColumn,
    reorderFunnelColumns, restoreFunnelDefaults, markLeadMessagesRead, messageLogs,
    leadTasks, addLeadTask, toggleLeadTask, deleteLeadTask, getTasksForLead,
  } = useCRMContext();
  const { devices, sales } = useInventoryContext();
  const { user } = useAuth();
  const seesAllOwners = can(user?.role, "manageAutomations");
  const canUseAI = can(user?.role, "useAI");

  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all"); // "all" | "mine" | nome do vendedor
  const [showLeadDialog, setShowLeadDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [showSendMsg, setShowSendMsg] = useState<string | null>(null);
  const [showFunnelSettings, setShowFunnelSettings] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [showMetrics, setShowMetrics] = useState(false);
  const [showTasks, setShowTasks] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");

  const now = new Date();
  const pendingToday = pendingTasksToday(leadTasks, now);
  const metrics = buildFunnelMetrics(leads, funnelColumns);

  const handleAddTask = async () => {
    if (!showTasks || !taskTitle.trim()) return;
    await addLeadTask({ leadId: showTasks, title: taskTitle.trim(), dueDate: taskDue ? new Date(taskDue + "T12:00:00").toISOString() : undefined });
    setTaskTitle(""); setTaskDue("");
  };

  // Form do lead
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [modelInterest, setModelInterest] = useState("");
  const [origin, setOrigin] = useState("Instagram");
  const [leadColumn, setLeadColumn] = useState("");
  const [notes, setNotes] = useState("");

  // Configuração do funil
  const [newColName, setNewColName] = useState("");
  const [newColColor, setNewColColor] = useState(COLUMN_COLORS[0]);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editColName, setEditColName] = useState("");
  const [editColColor, setEditColColor] = useState(COLUMN_COLORS[0]);

  const owners = [...new Set(leads.map((l) => l.ownerName).filter(Boolean))] as string[];
  const matchesOwner = (l: Lead) => {
    if (ownerFilter === "all") return true;
    if (ownerFilter === "mine") return l.ownerId === user?.id;
    return l.ownerName === ownerFilter;
  };
  const filteredLeads = leads.filter((l) => leadMatchesSearch(l, search) && matchesOwner(l));
  const summary = buildFunnelSummary(filteredLeads, funnelColumns);
  const deviceModels = [...new Set(devices.map((d) => d.model))];

  const resetForm = () => {
    setName(""); setPhone(""); setModelInterest(""); setOrigin("Instagram");
    setLeadColumn(""); setNotes(""); setEditingId(null);
  };
  const openCreate = () => { resetForm(); setShowLeadDialog(true); };
  const openEdit = (l: Lead) => {
    setEditingId(l.id);
    setName(l.name); setPhone(l.phone); setModelInterest(l.modelInterest);
    setOrigin(l.origin || "Instagram"); setLeadColumn(l.status); setNotes(l.notes || "");
    setShowLeadDialog(true);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) { toast.error("Preencha nome e telefone"); return; }
    const status = leadColumn || (funnelColumns.length > 0 ? funnelColumns[0].name : "Novo");
    setSaving(true);
    try {
      if (editingId) {
        await updateLead(editingId, { name, phone, modelInterest, origin, notes, status });
        toast.success("Lead atualizado!");
      } else {
        await addLead({ name, phone, modelInterest, origin, status, notes });
        toast.success("Lead cadastrado!");
      }
      resetForm(); setShowLeadDialog(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível salvar o lead.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendMessage = async (leadId: string, textOverride?: string): Promise<boolean> => {
    const lead = leads.find((l) => l.id === leadId);
    const body = textOverride ?? msgText;
    if (!lead || !body.trim()) return false;
    if (connectionStatus !== "connected") { toast.error("WhatsApp não conectado."); return false; }
    const success = await sendMessage(lead.phone, body);
    addMessageLog({
      recipientId: lead.id, recipientName: lead.name, recipientPhone: lead.phone,
      templateType: textOverride !== undefined ? "IA (sugestão)" : "Manual", message: body, status: success ? "sent" : "failed",
    });
    toast[success ? "success" : "error"](success ? "Mensagem enviada!" : "Falha ao enviar");
    if (success) { setMsgText(""); setShowSendMsg(null); }
    return success;
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    moveLeadInColumn(draggableId, destination.droppableId, destination.index);
  };

  const handleAddColumn = () => {
    if (!newColName.trim()) return;
    if (funnelColumns.find((c) => c.name === newColName.trim())) {
      toast.error("Já existe uma coluna com esse nome");
      return;
    }
    addFunnelColumn(newColName.trim(), newColColor);
    setNewColName("");
    toast.success("Coluna adicionada!");
  };

  const handleRenameColumn = async (id: string) => {
    if (!editColName.trim()) return;
    try {
      await updateFunnelColumn(id, { name: editColName.trim(), color: editColColor });
      setEditingCol(null);
      setEditColName("");
      toast.success("Etapa atualizada!");
    } catch {
      /* o hook mostra o motivo (ex.: nome repetido) */
    }
  };

  const moveColumn = async (idx: number, dir: -1 | 1) => {
    const ids = funnelColumns.map((c) => c.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    try { await reorderFunnelColumns(ids); } catch { /* o hook avisa */ }
  };

  const handleRestoreDefaults = async () => {
    try {
      const r = await restoreFunnelDefaults();
      toast.success(r.created.length ? `Etapas restauradas: ${r.created.join(", ")}.` : "Todas as etapas padrão já existem.");
    } catch { /* o hook avisa */ }
  };

  const handleRemoveColumn = async (col: { id: string; name: string }) => {
    if (leads.some((l) => l.status === col.name)) {
      toast.error(`A etapa "${col.name}" ainda tem leads. Mova-os para outra etapa antes de remover.`);
      return;
    }
    removeFunnelColumn(col.id);
  };

  // Mensagens recebidas ainda não vistas, por lead (webhook do WhatsApp)
  const unreadByLead = new Map<string, number>();
  for (const m of messageLogs) {
    if (m.direction === "in" && !m.readAt) unreadByLead.set(m.recipientId, (unreadByLead.get(m.recipientId) ?? 0) + 1);
  }
  const openConversation = (leadId: string) => {
    setShowSendMsg(leadId);
    if (unreadByLead.has(leadId)) markLeadMessagesRead(leadId);
  };
  const openHistory = (leadId: string) => {
    setShowHistory(leadId);
    if (unreadByLead.has(leadId)) markLeadMessagesRead(leadId);
  };

  return (
    <div className="space-y-4">
      {/* Resumo do funil */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border shadow-none">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total de leads</p>
            <p className="mt-1 text-xl font-semibold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Convertidos</p>
            <p className="mt-1 text-xl font-semibold text-success">{summary.converted}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Taxa de conversão</p>
            <p className="mt-1 text-xl font-semibold">{(summary.conversionRate * 100).toFixed(0)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de ações */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar lead..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os leads</SelectItem>
            <SelectItem value="mine">Meus leads</SelectItem>
            {seesAllOwners && owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setShowMetrics(true)}>
          <BarChart3 className="h-4 w-4 mr-1" /> Métricas
        </Button>
        <Button variant="outline" onClick={() => setShowFunnelSettings(true)}>
          <Settings2 className="h-4 w-4 mr-1" /> Funil
        </Button>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Novo Lead
        </Button>
      </div>

      {pendingToday > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <ListChecks className="h-4 w-4 text-warning" />
          Você tem <strong>{pendingToday}</strong> tarefa(s) de follow-up para hoje ou em atraso.
        </div>
      )}

      {(leadsLoading || columnsLoading) && (
        <p className="text-sm text-muted-foreground">Carregando funil…</p>
      )}

      {/* Kanban */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
          {funnelColumns.map((col) => {
            const columnLeads = filteredLeads.filter((l) => l.status === col.name);
            return (
              <div key={col.id} className="flex-shrink-0 w-[280px]">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: `hsl(${col.color})` }} />
                  <h3 className="text-sm font-semibold text-foreground truncate">{col.name}</h3>
                  <Badge variant="secondary" className="ml-auto text-xs">{columnLeads.length}</Badge>
                </div>
                <Droppable droppableId={col.name}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-2 rounded-lg border-2 border-dashed p-2 min-h-[300px] transition-colors ${
                        snapshot.isDraggingOver ? "border-primary/50 bg-primary/5" : "border-border bg-muted/30"
                      }`}
                    >
                      {columnLeads.map((lead, index) => {
                        const bought = leadHasPurchased(lead, sales);
                        return (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`border shadow-sm transition-shadow ${snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""}`}
                              >
                                <CardContent className="p-3">
                                  <div className="flex items-start gap-2">
                                    <div {...provided.dragHandleProps} className="mt-0.5 cursor-grab text-muted-foreground">
                                      <GripVertical className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                                        {bought && (
                                          <Badge variant="default" className="h-4 gap-0.5 px-1 text-[10px]">
                                            <ShoppingBag className="h-2.5 w-2.5" /> Comprou
                                          </Badge>
                                        )}
                                        {(unreadByLead.get(lead.id) ?? 0) > 0 && (
                                          <Badge variant="destructive" className="h-4 gap-0.5 px-1 text-[10px]" data-testid="lead-unread">
                                            <Inbox className="h-2.5 w-2.5" /> {unreadByLead.get(lead.id)} nova(s)
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground">{lead.phone}</p>
                                      {lead.modelInterest && (
                                        <Badge variant="outline" className="mt-1 text-xs">{lead.modelInterest}</Badge>
                                      )}
                                      <p className="text-xs text-muted-foreground mt-1">{lead.origin} · {format(lead.createdAt, "dd/MM")}</p>
                                    </div>
                                  </div>
                                  <div className="flex justify-end gap-1 mt-2 border-t pt-2">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Enviar mensagem" onClick={() => openConversation(lead.id)}>
                                      <MessageCircle className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 relative" title="Tarefas / follow-up" onClick={() => setShowTasks(lead.id)}>
                                      <ListChecks className="h-3.5 w-3.5" />
                                      {getTasksForLead(lead.id).some((t) => !t.done) && (
                                        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning" />
                                      )}
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Histórico" onClick={() => openHistory(lead.id)}>
                                      <History className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEdit(lead)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Excluir" onClick={() => setDeleteTarget(lead)}>
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                      {!leadsLoading && columnLeads.length === 0 && (
                        <p className="px-1 py-6 text-center text-xs text-muted-foreground">Sem leads</p>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Configurar Funil */}
      <Dialog open={showFunnelSettings} onOpenChange={setShowFunnelSettings}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader><DialogTitle>Configurar Funil</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Colunas do Funil</Label>
              {funnelColumns.map((col, idx) => (
                <div key={col.id} data-testid="funnel-col-row" className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: `hsl(${col.color})` }} />
                    {editingCol === col.id ? (
                      <>
                        <Input aria-label="Nome da etapa" value={editColName} onChange={(e) => setEditColName(e.target.value)} className="h-8 flex-1"
                          onKeyDown={(e) => e.key === "Enter" && handleRenameColumn(col.id)} />
                        <Button size="sm" variant="ghost" aria-label="Salvar etapa" onClick={() => handleRenameColumn(col.id)}>✓</Button>
                        <Button size="sm" variant="ghost" aria-label="Cancelar edição da etapa" onClick={() => setEditingCol(null)}>✕</Button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm flex-1">{col.name}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Subir etapa ${col.name}`} disabled={idx === 0} onClick={() => moveColumn(idx, -1)}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Descer etapa ${col.name}`} disabled={idx === funnelColumns.length - 1} onClick={() => moveColumn(idx, 1)}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" aria-label={`Editar etapa ${col.name}`}
                          onClick={() => { setEditingCol(col.id); setEditColName(col.name); setEditColColor(col.color); }}>
                          Editar
                        </Button>
                        {funnelColumns.length > 1 && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remover etapa ${col.name}`} title="Remover (só se estiver vazia)" onClick={() => handleRemoveColumn(col)}>
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  {editingCol === col.id && (
                    <div className="flex flex-wrap gap-2 pl-5">
                      {COLUMN_COLORS.map((c) => (
                        <button key={c} type="button" aria-label={`Cor ${c}`}
                          className={`h-5 w-5 rounded-full border-2 transition-all ${editColColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: `hsl(${c})` }} onClick={() => setEditColColor(c)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full gap-1" onClick={handleRestoreDefaults}>
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar etapas padrão
              </Button>
              <p className="text-xs text-muted-foreground">Cria só as etapas padrão que faltam; nada é apagado nem renomeado. Uma etapa só pode ser removida quando estiver vazia.</p>
            </div>
            <div className="border-t pt-4 space-y-3">
              <Label>Adicionar Coluna</Label>
              <Input value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="Nome da coluna"
                onKeyDown={(e) => e.key === "Enter" && handleAddColumn()} />
              <div className="flex gap-2 flex-wrap">
                {COLUMN_COLORS.map((c) => (
                  <button key={c}
                    className={`h-6 w-6 rounded-full border-2 transition-all ${newColColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: `hsl(${c})` }} onClick={() => setNewColColor(c)} />
                ))}
              </div>
              <Button className="w-full" onClick={handleAddColumn} disabled={!newColName.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Criar / Editar Lead */}
      <Dialog open={showLeadDialog} onOpenChange={(o) => { setShowLeadDialog(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Editar Lead" : "Novo Lead"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" /></div>
            <div><Label>WhatsApp *</Label><Input value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} placeholder="(11) 99999-9999" /></div>
            <div>
              <Label>Modelo de Interesse</Label>
              <Input list="lead-models" value={modelInterest} onChange={(e) => setModelInterest(e.target.value)} placeholder="Digite ou escolha um modelo" />
              <datalist id="lead-models">{deviceModels.map((m) => <option key={m} value={m} />)}</datalist>
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ORIGINS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Coluna do Funil</Label>
              <Select value={leadColumn} onValueChange={setLeadColumn}>
                <SelectTrigger><SelectValue placeholder="Primeira coluna" /></SelectTrigger>
                <SelectContent>{funnelColumns.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anotações sobre o lead (opcional)" />
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar" : "Cadastrar Lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enviar Mensagem */}
      <Dialog open={!!showSendMsg} onOpenChange={() => setShowSendMsg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar Mensagem WhatsApp</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {showSendMsg && getLogsForRecipient(showSendMsg).length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-2" data-testid="conversation">
                {getLogsForRecipient(showSendMsg).slice(0, 8).reverse().map((log) => (
                  <div key={log.id} className={`flex ${log.direction === "in" ? "justify-start" : "justify-end"}`}>
                    <p className={`max-w-[85%] whitespace-pre-line rounded-lg px-2 py-1 text-xs ${log.direction === "in" ? "bg-background border" : "bg-primary/10"}`}>
                      {log.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {connectionStatus !== "connected" && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                WhatsApp não conectado. Configure em "Conectar WhatsApp".
              </div>
            )}
            <div>
              <Label>Mensagem</Label>
              <Textarea className="min-h-[120px]" value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Digite sua mensagem..." />
            </div>
            {canUseAI && showSendMsg && (
              <AiSuggestPanel
                key={showSendMsg}
                leadId={showSendMsg}
                lastInbound={getLogsForRecipient(showSendMsg).find((l) => l.direction === "in")?.message ?? ""}
                canSend={connectionStatus === "connected"}
                onUse={setMsgText}
                onSend={(t) => handleSendMessage(showSendMsg, t)}
              />
            )}
            <div className="flex gap-2 flex-wrap">
              {(() => {
                const l = leads.find((x) => x.id === showSendMsg);
                return l ? <QuickReplyPicker lead={l} onPick={setMsgText} /> : null;
              })()}
              <Button variant="outline" size="sm" onClick={() => setMsgText("Olá! Tudo bem? Aqui é da Prime Paulista 🍎. Seu aparelho está pronto para retirada!")}>Pós-venda</Button>
              <Button variant="outline" size="sm" onClick={() => setMsgText("Olá! Passando para saber como está seu aparelho. Qualquer dúvida, estamos à disposição! 😊")}>Follow-up</Button>
              <Button variant="outline" size="sm" onClick={() => setMsgText("Olá! Temos novidades na loja que combinam com o que você procura. Vem conferir! 📱")}>Promoção</Button>
            </div>
            <Button className="w-full" onClick={() => showSendMsg && handleSendMessage(showSendMsg)} disabled={!msgText.trim() || connectionStatus !== "connected"}>
              <MessageCircle className="h-4 w-4 mr-1" /> Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={!!showHistory} onOpenChange={() => setShowHistory(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Histórico de Mensagens</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {showHistory && getLogsForRecipient(showHistory).length === 0 ? (
              <p className="text-center text-muted-foreground py-6">Nenhuma mensagem ainda</p>
            ) : (
              showHistory && getLogsForRecipient(showHistory).map((log) => (
                <div key={log.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    {log.direction !== "in" && <Badge variant="secondary">{log.templateType}</Badge>}
                    {log.direction === "in"
                      ? <Badge variant="outline">Recebida</Badge>
                      : <Badge variant={log.status === "sent" ? "default" : "destructive"}>{log.status === "sent" ? "Enviada" : "Falha"}</Badge>}
                  </div>
                  <p className="text-sm text-foreground">{log.message}</p>
                  <p className="text-xs text-muted-foreground">{format(log.sentAt, "dd/MM/yyyy HH:mm")}</p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Métricas por etapa */}
      <Dialog open={showMetrics} onOpenChange={setShowMetrics}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Métricas do funil</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Total de leads</span><span className="font-medium text-foreground">{summary.total}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Taxa de conversão</span><span className="font-medium text-foreground">{(summary.conversionRate * 100).toFixed(0)}%</span>
            </div>
            <div className="space-y-2 pt-2">
              {metrics.map((s) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `hsl(${s.color})` }} />
                      {s.name}
                    </span>
                    <span className="text-muted-foreground">{s.count} · {(s.pct * 100).toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full" style={{ width: `${s.pct * 100}%`, backgroundColor: `hsl(${s.color})` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tarefas / follow-up do lead */}
      <Dialog open={!!showTasks} onOpenChange={(o) => { if (!o) { setShowTasks(null); setTaskTitle(""); setTaskDue(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tarefas / follow-up</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {showTasks && getTasksForLead(showTasks).length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">Nenhuma tarefa para este lead.</p>
              )}
              {showTasks && getTasksForLead(showTasks).map((t) => {
                const overdue = t.dueDate && !t.done && new Date(t.dueDate).getTime() < now.getTime();
                return (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm">
                    <button onClick={() => toggleLeadTask(t.id, !t.done)} title="Concluir"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${t.done ? "bg-success text-success-foreground" : ""}`}>
                      {t.done && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`truncate ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                      {t.dueDate && <p className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>{new Date(t.dueDate).toLocaleDateString("pt-BR")}</p>}
                    </div>
                    <button onClick={() => deleteLeadTask(t.id)} title="Remover"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2 border-t pt-3">
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Ex.: Ligar para confirmar interesse" onKeyDown={(e) => e.key === "Enter" && handleAddTask()} />
              <div className="flex gap-2">
                <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="flex-1" />
                <Button onClick={handleAddTask} disabled={!taskTitle.trim()}>Adicionar</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && <>Tem certeza que deseja excluir <strong>{deleteTarget.name}</strong>? Esta ação não pode ser desfeita.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { deleteLead(deleteTarget.id); toast.success("Lead removido"); } setDeleteTarget(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
