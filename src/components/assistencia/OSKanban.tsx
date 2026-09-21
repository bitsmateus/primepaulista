import { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GripVertical, Clock, Eye, Trash2, Send, Printer, Plus, Search, Pencil, Download, Store, BellRing, MessageCircle } from "lucide-react";
import { useServiceOrderContext } from "@/contexts/ServiceOrderContext";
import { useAuth } from "@/contexts/AuthContext";
import { OSStatus, OSPriority, ServiceOrder, CostResponsibility } from "@/types/serviceOrder";
import {
  osProfit, daysInLab, OS_PRIORITIES, OS_ORIGINS, COST_RESPONSIBILITIES, FINALIZED,
  filterOrders, needsNotification, DEFAULT_OS_FILTERS, OSFilters, isExempt, chargedFieldLabel, EVENT_BY_STATUS,
} from "@/lib/serviceOrders";
import { OS_EVENT_LABELS } from "@/lib/osMessages";
import { useOsMessages, useOrderNotifications, useNotifyOrder } from "@/hooks/useOsMessages";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ServiceOrderPhotos } from "@/components/assistencia/ServiceOrderPhotos";
import OSForm from "@/components/assistencia/OSForm";
import { NotificationStatusBadge } from "@/components/assistencia/NotificationStatusBadge";
import { printOSReceipt } from "@/utils/osReceiptGenerator";
import { toast } from "sonner";
import { format } from "date-fns";

const OS_COLUMNS: { status: OSStatus; color: string }[] = [
  { status: "Aguardando Diagnóstico", color: "38 92% 50%" },
  { status: "Em Diagnóstico", color: "45 93% 47%" },
  { status: "Aguardando Aprovação", color: "280 65% 55%" },
  { status: "Aguardando Peça", color: "25 95% 53%" },
  { status: "Em Reparo", color: "211 100% 45%" },
  { status: "Pronto para Retirada", color: "160 84% 39%" },
  { status: "Entregue / Finalizado", color: "0 0% 45%" },
];

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function OSKanban() {
  const { orders, ordersLoading, moveOrderInKanban, updateOrder, deleteOrder, updateOrderStatus } = useServiceOrderContext();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { settings: msgSettings } = useOsMessages();
  const notifyMut = useNotifyOrder();

  const [filters, setFilters] = useState<OSFilters>(DEFAULT_OS_FILTERS);
  const setFilter = (patch: Partial<OSFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const [showNewOS, setShowNewOS] = useState(false);
  const [viewOrder, setViewOrder] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceOrder | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  // Edição de OS
  const [editing, setEditing] = useState<ServiceOrder | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [form, setForm] = useState<Partial<ServiceOrder>>({});

  const pendingCount = orders.filter((o) => needsNotification(o, msgSettings.enabled)).length;
  const filteredOrders = filterOrders(orders, filters, msgSettings.enabled);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as OSStatus;
    // O aviso por WhatsApp é enviado pelo servidor (modelo editável em "Mensagens")
    moveOrderInKanban(result.draggableId, newStatus, result.destination.index);
  };

  const selectedOrder = orders.find((o) => o.id === viewOrder);
  const { data: history = [], isLoading: historyLoading } = useOrderNotifications(viewOrder);

  const handleFinalize = async (order: ServiceOrder) => {
    setFinalizing(true);
    try {
      await updateOrderStatus(order.id, FINALIZED); // lança em erro (onError já avisa)
    } catch {
      setFinalizing(false);
      return;
    }
    printOSReceipt({ ...order, status: FINALIZED, completedAt: new Date() });
    toast.success("OS finalizada!");
    setFinalizing(false);
    setViewOrder(null);
  };

  const openEdit = (o: ServiceOrder) => {
    setEditing(o);
    setForm({
      customerName: o.customerName, customerPhone: o.customerPhone, model: o.model, color: o.color,
      serialImei: o.serialImei, imei2: o.imei2, serial: o.serial, batteryHealth: o.batteryHealth, reportedIssue: o.reportedIssue,
      technicalNotes: o.technicalNotes, priority: o.priority, partDescription: o.partDescription,
      partCost: o.partCost, laborCost: o.laborCost, chargedAmount: o.chargedAmount, taxes: o.taxes,
      costResponsibility: o.costResponsibility,
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const fromStock = editing.origin === "Estoque da loja";
    if (!fromStock && (!form.customerName?.trim() || !form.model?.trim())) {
      toast.error("Cliente e modelo são obrigatórios.");
      return;
    }
    if (!form.reportedIssue?.trim()) {
      toast.error("O defeito é obrigatório.");
      return;
    }
    setSavingEdit(true);
    try {
      const payload = { ...form };
      if (isExempt(payload.costResponsibility)) payload.chargedAmount = 0;
      await updateOrder(editing.id, payload);
      toast.success("OS atualizada!");
      setEditing(null);
    } catch {
      // onError já exibe o erro
    } finally {
      setSavingEdit(false);
    }
  };

  const exportCSV = () => {
    const headers = ["Cliente", "Telefone", "Modelo", "IMEI", "Status", "Prioridade", "Origem", "Quem paga", "Dias", "Cobrado", "Lucro", "Criada"];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const now = new Date();
    const rows = filteredOrders.map((o) =>
      [o.customerName, o.customerPhone, o.model, o.serialImei, o.status, o.priority, o.origin, o.costResponsibility,
       daysInLab(o, now), o.chargedAmount.toFixed(2), osProfit(o).toFixed(2),
       new Date(o.createdAt).toLocaleDateString("pt-BR")].map((v) => esc(String(v))).join(";")
    );
    const csv = "﻿" + [headers.map(esc).join(";"), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `ordens-servico-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const set = (patch: Partial<ServiceOrder>) => setForm((f) => ({ ...f, ...patch }));
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const profit = selectedOrder ? osProfit(selectedOrder) : 0;
  const editExempt = isExempt(form.costResponsibility);
  const selectedEvent = selectedOrder ? EVENT_BY_STATUS[selectedOrder.status] : undefined;

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, modelo, IMEI, defeito..." value={filters.search} onChange={(e) => setFilter({ search: e.target.value })} className="pl-9" />
        </div>
        <Select value={filters.priority} onValueChange={(v) => setFilter({ priority: v })}>
          <SelectTrigger className="w-44" aria-label="Filtrar por prioridade"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas prioridades</SelectItem>
            {OS_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.origin} onValueChange={(v) => setFilter({ origin: v })}>
          <SelectTrigger className="w-40" aria-label="Filtrar por origem"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            {OS_ORIGINS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.responsibility} onValueChange={(v) => setFilter({ responsibility: v })}>
          <SelectTrigger className="w-52" aria-label="Filtrar por quem paga"><SelectValue placeholder="Quem paga" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Quem paga: todos</SelectItem>
            {COST_RESPONSIBILITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={filters.pendingOnly ? "default" : "outline"}
          aria-pressed={filters.pendingOnly}
          onClick={() => setFilter({ pendingOnly: !filters.pendingOnly })}
          className="gap-2"
          title="OS que deveriam ter aviso por WhatsApp e ainda não tiveram envio com sucesso"
        >
          <BellRing className="h-4 w-4" /> Pendentes ({pendingCount})
        </Button>
        <Button variant="outline" onClick={exportCSV} className="gap-2"><Download className="h-4 w-4" /> CSV</Button>
        <Button onClick={() => setShowNewOS(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova OS</Button>
      </div>

      {ordersLoading && <p className="text-sm text-muted-foreground">Carregando ordens de serviço…</p>}

      {/* Kanban */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
          {OS_COLUMNS.map(({ status, color }) => {
            const colOrders = filteredOrders.filter((o) => o.status === status);
            return (
              <div key={status} className="flex-shrink-0 w-[260px]" data-testid={`os-col-${status}`}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: `hsl(${color})` }} />
                  <h3 className="text-xs font-semibold text-foreground truncate">{status}</h3>
                  <Badge variant="secondary" className="ml-auto text-xs">{colOrders.length}</Badge>
                </div>
                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-2 rounded-lg border-2 border-dashed p-2 min-h-[300px] transition-colors ${
                        snapshot.isDraggingOver ? "border-primary/50 bg-primary/5" : "border-border bg-muted/30"
                      }`}
                    >
                      {colOrders.map((order, index) => {
                        const days = daysInLab(order, new Date());
                        const pending = needsNotification(order, msgSettings.enabled);
                        return (
                          <Draggable key={order.id} draggableId={order.id} index={index}>
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                data-testid="os-card"
                                data-os-id={order.id}
                                className={`border shadow-sm transition-shadow ${snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""} ${order.priority === "Urgente" ? "border-l-4 border-l-warning" : order.priority === "Crítico" ? "border-l-4 border-l-destructive" : ""}`}
                              >
                                <CardContent className="p-3">
                                  <div className="flex items-start gap-2">
                                    <div {...provided.dragHandleProps} className="mt-0.5 cursor-grab text-muted-foreground" aria-label={`Arrastar OS de ${order.customerName}`}>
                                      <GripVertical className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">{order.customerName}</p>
                                      <p className="text-xs text-muted-foreground">{order.model}</p>
                                      <p className="text-xs text-muted-foreground truncate mt-0.5">{order.reportedIssue}</p>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                        <span className={`text-xs ${days > 3 && order.status !== FINALIZED ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                          {days}d no lab
                                        </span>
                                        {order.priority !== "Normal" && (
                                          <Badge variant={order.priority === "Crítico" ? "destructive" : "secondary"} className="text-xs h-5">{order.priority}</Badge>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                        {order.origin === "Estoque da loja" && (
                                          <Badge variant="outline" className="h-5 gap-1 text-[10px]" data-testid="os-origin-badge">
                                            <Store className="h-3 w-3" /> Estoque da loja
                                          </Badge>
                                        )}
                                        {order.costResponsibility !== "Cliente" && (
                                          <Badge variant="secondary" className="h-5 text-[10px]" data-testid="os-resp-badge">{order.costResponsibility}</Badge>
                                        )}
                                        {pending && (
                                          <Badge variant="outline" className="h-5 gap-1 text-[10px] border-warning text-warning" data-testid="os-pending-badge">
                                            <BellRing className="h-3 w-3" /> Aviso pendente
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex justify-end gap-1 mt-2 border-t pt-2">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhes" onClick={() => setViewOrder(order.id)}>
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEdit(order)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    {isAdmin && (
                                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Excluir" onClick={() => setDeleteTarget(order)}>
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                      </Button>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                      {!ordersLoading && colOrders.length === 0 && (
                        <p className="px-1 py-6 text-center text-xs text-muted-foreground">Sem OS</p>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Nova OS (pop-up) */}
      <Dialog open={showNewOS} onOpenChange={setShowNewOS}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Ordem de Serviço</DialogTitle></DialogHeader>
          <OSForm onCreated={() => setShowNewOS(false)} />
        </DialogContent>
      </Dialog>

      {/* Detalhe da OS */}
      <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes da OS</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{selectedOrder.status}</Badge>
                <Badge variant="outline" className="gap-1" data-testid="detail-origin">
                  {selectedOrder.origin === "Estoque da loja" && <Store className="h-3 w-3" />}
                  {selectedOrder.origin === "Estoque da loja" ? "Estoque da loja" : "Aparelho do cliente"}
                </Badge>
                <Badge variant="outline" data-testid="detail-resp">Quem paga: {selectedOrder.costResponsibility}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Cliente</Label>
                  <p className="text-sm font-medium">{selectedOrder.customerName}</p>
                  <p className="text-xs text-muted-foreground">{selectedOrder.customerPhone}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Aparelho</Label>
                  <p className="text-sm font-medium">{selectedOrder.model} — {selectedOrder.color}</p>
                  <p className="text-xs text-muted-foreground">IMEI 1: {selectedOrder.serialImei || "—"}</p>
                  {selectedOrder.imei2 && <p className="text-xs text-muted-foreground">IMEI 2: {selectedOrder.imei2}</p>}
                  {selectedOrder.serial && <p className="text-xs text-muted-foreground">Serial: {selectedOrder.serial}</p>}
                  <p className="text-xs text-muted-foreground">Bateria: {selectedOrder.batteryHealth}%</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Defeito Relatado</Label>
                <p className="text-sm">{selectedOrder.reportedIssue}</p>
              </div>
              {selectedOrder.technicalNotes && (
                <div>
                  <Label className="text-xs text-muted-foreground">Observações Técnicas</Label>
                  <p className="text-sm">{selectedOrder.technicalNotes}</p>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Checklist de Entrada</Label>
                <div className="flex gap-3 mt-1">
                  {selectedOrder.checklist.capa && <Badge variant="outline">Capa</Badge>}
                  {selectedOrder.checklist.chip && <Badge variant="outline">Chip</Badge>}
                  {selectedOrder.checklist.carregador && <Badge variant="outline">Carregador</Badge>}
                  {!selectedOrder.checklist.capa && !selectedOrder.checklist.chip && !selectedOrder.checklist.carregador && (
                    <span className="text-xs text-muted-foreground">Nenhum item</span>
                  )}
                </div>
              </div>
              <div className="border-t pt-4">
                <Label className="text-xs text-muted-foreground">Fotos do Aparelho</Label>
                <div className="mt-2"><ServiceOrderPhotos osId={selectedOrder.id} /></div>
              </div>
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-semibold">Financeiro</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <Label className="text-xs">Custo da Peça</Label>
                    <p className="font-medium">{money(selectedOrder.partCost)}</p>
                    {selectedOrder.partDescription && <p className="text-xs text-muted-foreground">{selectedOrder.partDescription}</p>}
                  </div>
                  <div><Label className="text-xs">Mão de Obra</Label><p className="font-medium">{money(selectedOrder.laborCost)}</p></div>
                  <div>
                    <Label className="text-xs">{selectedOrder.costResponsibility === "Dividido / Co-participação" ? "Parte do cliente" : "Valor Cobrado"}</Label>
                    <p className="font-medium" data-testid="detail-charged">{money(selectedOrder.chargedAmount)}</p>
                  </div>
                  <div><Label className="text-xs">Impostos/Taxas</Label><p className="font-medium">{money(selectedOrder.taxes)}</p></div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Lucro Líquido</span>
                    <span className={`text-sm font-bold ${profit >= 0 ? "text-success" : "text-destructive"}`}>{money(profit)}</span>
                  </div>
                </div>
              </div>

              {/* Avisos por WhatsApp */}
              <div className="border-t pt-4 space-y-2" data-testid="os-history">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><MessageCircle className="h-4 w-4" /> Avisos por WhatsApp</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={notifyMut.isPending}
                    onClick={() => notifyMut.mutate({ osId: selectedOrder.id })}
                    title={selectedEvent ? `Enviar agora: ${OS_EVENT_LABELS[selectedEvent]}` : "Esta etapa não tem aviso automático"}
                  >
                    {notifyMut.isPending ? "Enviando..." : "Notificar agora"}
                  </Button>
                </div>
                {!selectedEvent && (
                  <p className="text-xs text-muted-foreground">Esta etapa não tem aviso automático. Os avisos saem em Aguardando Aprovação, Pronto para Retirada e Entregue.</p>
                )}
                {historyLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando histórico…</p>
                ) : history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum aviso registrado para esta OS.</p>
                ) : (
                  <ul className="space-y-2">
                    {history.map((n) => (
                      <li key={n.id} className="rounded-lg border p-2 text-xs" data-testid="os-history-item">
                        <div className="flex flex-wrap items-center gap-2">
                          <NotificationStatusBadge status={n.status} />
                          <span className="font-medium">{OS_EVENT_LABELS[n.event]}</span>
                          <span className="ml-auto text-muted-foreground">{format(n.createdAt, "dd/MM/yyyy HH:mm")}</span>
                        </div>
                        {n.error && <p className="mt-1 text-muted-foreground">{n.error}</p>}
                        <p className="mt-1 whitespace-pre-line text-muted-foreground">{n.message}</p>
                        {n.status !== "sent" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-7 px-2"
                            disabled={notifyMut.isPending}
                            onClick={() => notifyMut.mutate({ osId: selectedOrder.id, event: n.event })}
                          >
                            Reenviar
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { const o = selectedOrder; setViewOrder(null); openEdit(o); }}>
                  <Pencil className="h-4 w-4 mr-1" /> Editar
                </Button>
                {selectedOrder.status !== FINALIZED && (
                  <Button className="flex-1" disabled={finalizing} onClick={() => handleFinalize(selectedOrder)}>
                    <Send className="h-4 w-4 mr-1" /> {finalizing ? "Finalizando..." : "Finalizar e Entregar"}
                  </Button>
                )}
              </div>
              <Button variant="outline" className="w-full" onClick={() => printOSReceipt(selectedOrder)}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir Recibo / Garantia
              </Button>
              <p className="text-xs text-muted-foreground text-center">Criada em {format(selectedOrder.createdAt, "dd/MM/yyyy HH:mm")}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Editar OS */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar OS</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {editing?.origin === "Estoque da loja" && (
              <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">
                Aparelho do estoque da loja: modelo, cor e IMEI vêm do cadastro do aparelho e não mudam aqui.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{editing?.origin === "Estoque da loja" ? "Cliente" : "Cliente *"}</Label><Input value={form.customerName ?? ""} onChange={(e) => set({ customerName: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={form.customerPhone ?? ""} onChange={(e) => set({ customerPhone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Modelo *</Label><Input value={form.model ?? ""} disabled={editing?.origin === "Estoque da loja"} onChange={(e) => set({ model: e.target.value })} /></div>
              <div><Label>Cor</Label><Input value={form.color ?? ""} disabled={editing?.origin === "Estoque da loja"} onChange={(e) => set({ color: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-base font-semibold">IMEI 1</Label><Input value={form.serialImei ?? ""} disabled={editing?.origin === "Estoque da loja"} onChange={(e) => set({ serialImei: e.target.value })} className="h-11 text-base font-semibold" /></div>
              <div><Label className="text-base font-semibold">IMEI 2</Label><Input value={form.imei2 ?? ""} disabled={editing?.origin === "Estoque da loja"} onChange={(e) => set({ imei2: e.target.value })} className="h-11 text-base font-semibold" /></div>
              <div><Label className="text-base font-semibold">Serial</Label><Input value={form.serial ?? ""} disabled={editing?.origin === "Estoque da loja"} onChange={(e) => set({ serial: e.target.value })} className="h-11 text-base font-semibold" /></div>
              <div><Label>Bateria (%)</Label><Input type="number" value={form.batteryHealth ?? 0} onChange={(e) => set({ batteryHealth: num(e.target.value) })} /></div>
            </div>
            <div><Label>Defeito Relatado *</Label><Textarea value={form.reportedIssue ?? ""} onChange={(e) => set({ reportedIssue: e.target.value })} rows={2} /></div>
            <div><Label>Observações Técnicas</Label><Textarea value={form.technicalNotes ?? ""} onChange={(e) => set({ technicalNotes: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(v) => set({ priority: v as OSPriority })}>
                  <SelectTrigger aria-label="Prioridade da OS"><SelectValue /></SelectTrigger>
                  <SelectContent>{OS_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Descrição da Peça</Label><Input value={form.partDescription ?? ""} onChange={(e) => set({ partDescription: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Custo da Peça (R$)</Label><Input type="number" value={form.partCost ?? 0} onChange={(e) => set({ partCost: num(e.target.value) })} /></div>
              <div><Label>Mão de Obra (R$)</Label><Input type="number" value={form.laborCost ?? 0} onChange={(e) => set({ laborCost: num(e.target.value) })} /></div>
            </div>
            <div>
              <Label>Quem paga o custo</Label>
              <Select value={form.costResponsibility} onValueChange={(v) => set({ costResponsibility: v as CostResponsibility, ...(isExempt(v) ? { chargedAmount: 0 } : {}) })}>
                <SelectTrigger aria-label="Quem paga o custo"><SelectValue /></SelectTrigger>
                <SelectContent>{COST_RESPONSIBILITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-charged">{chargedFieldLabel(form.costResponsibility)}</Label>
                <Input id="edit-charged" type="number" value={editExempt ? 0 : form.chargedAmount ?? 0} disabled={editExempt} onChange={(e) => set({ chargedAmount: num(e.target.value) })} />
                {editExempt && <p className="mt-1 text-xs text-muted-foreground">Coberto pela loja: nada é cobrado do cliente.</p>}
              </div>
              <div><Label>Impostos/Taxas (R$)</Label><Input type="number" value={form.taxes ?? 0} onChange={(e) => set({ taxes: num(e.target.value) })} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit}>{savingEdit ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir OS?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && <>Excluir a OS de <strong>{deleteTarget.customerName}</strong> ({deleteTarget.model})? Esta ação não pode ser desfeita.
                {deleteTarget.origin === "Estoque da loja" && deleteTarget.status !== FINALIZED && " O aparelho volta para o estoque."}</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { deleteOrder(deleteTarget.id); toast.success("OS removida"); } setDeleteTarget(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
