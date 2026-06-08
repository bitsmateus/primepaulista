import { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GripVertical, Clock, Eye, Trash2, Send, Printer, Plus, Search, Pencil, Download } from "lucide-react";
import { useServiceOrderContext } from "@/contexts/ServiceOrderContext";
import { useCRMContext } from "@/contexts/CRMContext";
import { useAuth } from "@/contexts/AuthContext";
import { OSStatus, OSPriority, ServiceOrder } from "@/types/serviceOrder";
import { osProfit, daysInLab, osMatchesSearch, OS_PRIORITIES, READY, FINALIZED } from "@/lib/serviceOrders";
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
import { printOSReceipt } from "@/utils/osReceiptGenerator";
import { toast } from "sonner";
import { format } from "date-fns";

const OS_COLUMNS: { status: OSStatus; color: string }[] = [
  { status: "Aguardando Diagnóstico", color: "38 92% 50%" },
  { status: "Aguardando Peça", color: "25 95% 53%" },
  { status: "Em Reparo", color: "211 100% 45%" },
  { status: "Pronto para Retirada", color: "160 84% 39%" },
  { status: "Entregue / Finalizado", color: "0 0% 45%" },
];

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function OSKanban() {
  const { orders, ordersLoading, moveOrderInKanban, updateOrder, deleteOrder, updateOrderStatus } = useServiceOrderContext();
  const { sendMessage, connectionStatus } = useCRMContext();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [showNewOS, setShowNewOS] = useState(false);
  const [viewOrder, setViewOrder] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceOrder | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  // Edição de OS
  const [editing, setEditing] = useState<ServiceOrder | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [form, setForm] = useState<Partial<ServiceOrder>>({});

  const filteredOrders = orders.filter(
    (o) => osMatchesSearch(o, search) && (priorityFilter === "all" || o.priority === priorityFilter)
  );

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as OSStatus;
    const order = orders.find((o) => o.id === result.draggableId);
    moveOrderInKanban(result.draggableId, newStatus, result.destination.index);
    // Notifica automaticamente quando a OS fica pronta para retirada
    if (order && newStatus === READY && order.status !== READY && connectionStatus === "connected" && order.customerPhone) {
      await sendMessage(order.customerPhone, `Olá ${order.customerName}! 🍎 Seu aparelho (${order.model}) está pronto para retirada na Prime Paulista!`);
      toast.success("Cliente notificado: pronto para retirada!");
    }
  };

  const selectedOrder = orders.find((o) => o.id === viewOrder);

  const handleFinalize = async (order: ServiceOrder) => {
    setFinalizing(true);
    try {
      await updateOrderStatus(order.id, FINALIZED); // lança em erro (onError já avisa)
    } catch {
      setFinalizing(false);
      return;
    }
    printOSReceipt({ ...order, status: FINALIZED, completedAt: new Date() });
    if (connectionStatus === "connected" && order.customerPhone) {
      await sendMessage(order.customerPhone, `Olá ${order.customerName}! 🍎 Seu aparelho (${order.model}) está pronto para retirada na Prime Paulista! Nosso horário: Seg-Sáb 9h-18h.`);
      toast.success("Cliente notificado via WhatsApp!");
    }
    toast.success("OS finalizada!");
    setFinalizing(false);
    setViewOrder(null);
  };

  const openEdit = (o: ServiceOrder) => {
    setEditing(o);
    setForm({
      customerName: o.customerName, customerPhone: o.customerPhone, model: o.model, color: o.color,
      serialImei: o.serialImei, batteryHealth: o.batteryHealth, reportedIssue: o.reportedIssue,
      technicalNotes: o.technicalNotes, priority: o.priority, partDescription: o.partDescription,
      partCost: o.partCost, laborCost: o.laborCost, chargedAmount: o.chargedAmount, taxes: o.taxes,
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!form.customerName?.trim() || !form.model?.trim() || !form.reportedIssue?.trim()) {
      toast.error("Cliente, modelo e defeito são obrigatórios.");
      return;
    }
    setSavingEdit(true);
    try {
      await updateOrder(editing.id, form);
      toast.success("OS atualizada!");
      setEditing(null);
    } catch {
      // onError já exibe o erro
    } finally {
      setSavingEdit(false);
    }
  };

  const exportCSV = () => {
    const headers = ["Cliente", "Telefone", "Modelo", "IMEI", "Status", "Prioridade", "Dias", "Cobrado", "Lucro", "Criada"];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const now = new Date();
    const rows = filteredOrders.map((o) =>
      [o.customerName, o.customerPhone, o.model, o.serialImei, o.status, o.priority,
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

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, modelo, IMEI, defeito..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas prioridades</SelectItem>
            {OS_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
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
              <div key={status} className="flex-shrink-0 w-[260px]">
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
                        return (
                          <Draggable key={order.id} draggableId={order.id} index={index}>
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`border shadow-sm transition-shadow ${snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""} ${order.priority === "Urgente" ? "border-l-4 border-l-warning" : order.priority === "Crítico" ? "border-l-4 border-l-destructive" : ""}`}
                              >
                                <CardContent className="p-3">
                                  <div className="flex items-start gap-2">
                                    <div {...provided.dragHandleProps} className="mt-0.5 cursor-grab text-muted-foreground">
                                      <GripVertical className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">{order.customerName}</p>
                                      <p className="text-xs text-muted-foreground">{order.model}</p>
                                      <p className="text-xs text-muted-foreground truncate mt-0.5">{order.reportedIssue}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                        <span className={`text-xs ${days > 3 && order.status !== FINALIZED ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                          {days}d no lab
                                        </span>
                                        {order.priority !== "Normal" && (
                                          <Badge variant={order.priority === "Crítico" ? "destructive" : "secondary"} className="text-xs h-5">{order.priority}</Badge>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Cliente</Label>
                  <p className="text-sm font-medium">{selectedOrder.customerName}</p>
                  <p className="text-xs text-muted-foreground">{selectedOrder.customerPhone}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Aparelho</Label>
                  <p className="text-sm font-medium">{selectedOrder.model} — {selectedOrder.color}</p>
                  <p className="text-xs text-muted-foreground">IMEI: {selectedOrder.serialImei}</p>
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
                  <div><Label className="text-xs">Valor Cobrado</Label><p className="font-medium">{money(selectedOrder.chargedAmount)}</p></div>
                  <div><Label className="text-xs">Impostos/Taxas</Label><p className="font-medium">{money(selectedOrder.taxes)}</p></div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Lucro Líquido</span>
                    <span className={`text-sm font-bold ${profit >= 0 ? "text-success" : "text-destructive"}`}>{money(profit)}</span>
                  </div>
                </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cliente *</Label><Input value={form.customerName ?? ""} onChange={(e) => set({ customerName: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={form.customerPhone ?? ""} onChange={(e) => set({ customerPhone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Modelo *</Label><Input value={form.model ?? ""} onChange={(e) => set({ model: e.target.value })} /></div>
              <div><Label>Cor</Label><Input value={form.color ?? ""} onChange={(e) => set({ color: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Serial/IMEI</Label><Input value={form.serialImei ?? ""} onChange={(e) => set({ serialImei: e.target.value })} /></div>
              <div><Label>Bateria (%)</Label><Input type="number" value={form.batteryHealth ?? 0} onChange={(e) => set({ batteryHealth: num(e.target.value) })} /></div>
            </div>
            <div><Label>Defeito Relatado *</Label><Textarea value={form.reportedIssue ?? ""} onChange={(e) => set({ reportedIssue: e.target.value })} rows={2} /></div>
            <div><Label>Observações Técnicas</Label><Textarea value={form.technicalNotes ?? ""} onChange={(e) => set({ technicalNotes: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(v) => set({ priority: v as OSPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OS_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Descrição da Peça</Label><Input value={form.partDescription ?? ""} onChange={(e) => set({ partDescription: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Custo da Peça (R$)</Label><Input type="number" value={form.partCost ?? 0} onChange={(e) => set({ partCost: num(e.target.value) })} /></div>
              <div><Label>Mão de Obra (R$)</Label><Input type="number" value={form.laborCost ?? 0} onChange={(e) => set({ laborCost: num(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor Cobrado (R$)</Label><Input type="number" value={form.chargedAmount ?? 0} onChange={(e) => set({ chargedAmount: num(e.target.value) })} /></div>
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
              {deleteTarget && <>Excluir a OS de <strong>{deleteTarget.customerName}</strong> ({deleteTarget.model})? Esta ação não pode ser desfeita.</>}
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
