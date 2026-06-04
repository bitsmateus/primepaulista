import { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GripVertical, Clock, Eye, Trash2, Send, Printer } from "lucide-react";
import { useServiceOrderContext } from "@/contexts/ServiceOrderContext";
import { useCRMContext } from "@/contexts/CRMContext";
import { OSStatus } from "@/types/serviceOrder";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ServiceOrderPhotos } from "@/components/assistencia/ServiceOrderPhotos";
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

export default function OSKanban() {
  const { orders, moveOrderInKanban, updateOrder, deleteOrder, updateOrderStatus } = useServiceOrderContext();
  const { sendMessage, connectionStatus } = useCRMContext();
  const [viewOrder, setViewOrder] = useState<string | null>(null);
  const [editChargedAmount, setEditChargedAmount] = useState("");

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    moveOrderInKanban(result.draggableId, result.destination.droppableId as OSStatus, result.destination.index);
  };

  const selectedOrder = orders.find((o) => o.id === viewOrder);

  const handleFinalize = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    updateOrderStatus(orderId, "Entregue / Finalizado");

    // Recibo com certificado de garantia
    printOSReceipt({ ...order, status: "Entregue / Finalizado", completedAt: new Date() });

    // Notify via WhatsApp
    if (connectionStatus === "connected" && order.customerPhone) {
      await sendMessage(order.customerPhone, `Olá ${order.customerName}! 🍎 Seu aparelho (${order.model}) está pronto para retirada na Prime Paulista! Nosso horário de funcionamento: Seg-Sáb 9h-18h.`);
      toast.success("Cliente notificado via WhatsApp!");
    }
    
    toast.success("OS finalizada!");
    setViewOrder(null);
  };

  const profit = selectedOrder
    ? selectedOrder.chargedAmount - selectedOrder.partCost - selectedOrder.taxes
    : 0;

  return (
    <div className="space-y-4">
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
          {OS_COLUMNS.map(({ status, color }) => {
            const colOrders = orders.filter((o) => o.status === status);
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
                        const days = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                        return (
                          <Draggable key={order.id} draggableId={order.id} index={index}>
                            {(provided, snapshot) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`border shadow-sm transition-shadow ${
                                  snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""
                                } ${order.priority === "Urgente" ? "border-l-4 border-l-warning" : order.priority === "Crítico" ? "border-l-4 border-l-destructive" : ""}`}
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
                                        <span className={`text-xs ${days > 3 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                          {days}d no lab
                                        </span>
                                        {order.priority !== "Normal" && (
                                          <Badge variant={order.priority === "Crítico" ? "destructive" : "secondary"} className="text-xs h-5">
                                            {order.priority}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex justify-end gap-1 mt-2 border-t pt-2">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewOrder(order.id)}>
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { deleteOrder(order.id); toast.success("OS removida"); }}>
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
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Order Detail Dialog */}
      <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da OS</DialogTitle>
          </DialogHeader>
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
                <div className="mt-2">
                  <ServiceOrderPhotos osId={selectedOrder.id} />
                </div>
              </div>
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-semibold">Financeiro</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Custo da Peça</Label>
                    <p className="text-sm font-medium">
                      {selectedOrder.partCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                    {selectedOrder.partDescription && <p className="text-xs text-muted-foreground">{selectedOrder.partDescription}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">Mão de Obra</Label>
                    <p className="text-sm font-medium">
                      {selectedOrder.laborCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Valor Cobrado</Label>
                    <Input
                      type="number"
                      value={editChargedAmount || selectedOrder.chargedAmount}
                      onChange={(e) => setEditChargedAmount(e.target.value)}
                      onBlur={() => {
                        if (editChargedAmount) {
                          updateOrder(selectedOrder.id, { chargedAmount: Number(editChargedAmount) });
                          setEditChargedAmount("");
                        }
                      }}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Impostos/Taxas</Label>
                    <p className="text-sm font-medium">
                      {selectedOrder.taxes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Lucro Líquido</span>
                    <span className={`text-sm font-bold ${profit >= 0 ? "text-success" : "text-destructive"}`}>
                      {profit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>
                </div>
              </div>
              {selectedOrder.status !== "Entregue / Finalizado" && (
                <Button className="w-full" onClick={() => handleFinalize(selectedOrder.id)}>
                  <Send className="h-4 w-4 mr-1" /> Finalizar e Entregar
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => printOSReceipt(selectedOrder)}
              >
                <Printer className="h-4 w-4 mr-1" /> Imprimir Recibo / Garantia
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Criada em {format(selectedOrder.createdAt, "dd/MM/yyyy HH:mm")}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
