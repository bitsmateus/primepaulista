import { useState } from "react";
import { Plus, Search, Trash2, MessageCircle, History, Settings2, X, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useCRMContext } from "@/contexts/CRMContext";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

const ORIGINS = ["Instagram", "Indicação", "Tráfego Pago", "WhatsApp", "Site", "Outro"];

const COLUMN_COLORS = [
  "211 100% 45%",
  "38 92% 50%",
  "25 95% 53%",
  "160 84% 39%",
  "0 84% 60%",
  "270 70% 55%",
  "190 80% 42%",
  "330 80% 55%",
];

export default function LeadsTab() {
  const {
    leads, addLead, deleteLead, moveLeadInColumn,
    sendMessage, addMessageLog, getLogsForRecipient, connectionStatus,
    funnelColumns, addFunnelColumn, removeFunnelColumn, renameFunnelColumn,
  } = useCRMContext();
  const { devices } = useInventoryContext();

  const [search, setSearch] = useState("");
  const [showAddLead, setShowAddLead] = useState(false);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [showSendMsg, setShowSendMsg] = useState<string | null>(null);
  const [showFunnelSettings, setShowFunnelSettings] = useState(false);
  const [msgText, setMsgText] = useState("");

  // New lead form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [modelInterest, setModelInterest] = useState("");
  const [origin, setOrigin] = useState("Instagram");
  const [leadColumn, setLeadColumn] = useState("");

  // Funnel settings
  const [newColName, setNewColName] = useState("");
  const [newColColor, setNewColColor] = useState(COLUMN_COLORS[0]);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editColName, setEditColName] = useState("");

  const filteredLeads = leads.filter((l) => {
    const q = search.toLowerCase();
    return l.name.toLowerCase().includes(q) || l.phone.includes(q) || l.modelInterest.toLowerCase().includes(q);
  });

  const handleAddLead = () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("Preencha nome e telefone");
      return;
    }
    const status = leadColumn || (funnelColumns.length > 0 ? funnelColumns[0].name : "Novo");
    addLead({ name, phone, modelInterest, origin, status, notes: "" });
    toast.success("Lead cadastrado!");
    setName(""); setPhone(""); setModelInterest(""); setOrigin("Instagram"); setLeadColumn("");
    setShowAddLead(false);
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleSendMessage = async (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || !msgText.trim()) return;
    if (connectionStatus !== "connected") {
      toast.error("WhatsApp não conectado.");
      return;
    }
    const success = await sendMessage(lead.phone, msgText);
    addMessageLog({
      recipientId: lead.id, recipientName: lead.name, recipientPhone: lead.phone,
      templateType: "Manual", message: msgText, status: success ? "sent" : "failed",
    });
    toast[success ? "success" : "error"](success ? "Mensagem enviada!" : "Falha ao enviar");
    setMsgText(""); setShowSendMsg(null);
  };

  const deviceModels = [...new Set(devices.map((d) => d.model))];

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

  const handleRenameColumn = (id: string) => {
    if (!editColName.trim()) return;
    renameFunnelColumn(id, editColName.trim());
    setEditingCol(null);
    setEditColName("");
    toast.success("Coluna renomeada!");
  };

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar lead..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button variant="outline" onClick={() => setShowFunnelSettings(true)}>
          <Settings2 className="h-4 w-4 mr-1" /> Funil
        </Button>
        <Button onClick={() => setShowAddLead(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Lead
        </Button>
      </div>

      {/* Kanban */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
          {funnelColumns.map((col) => {
            const columnLeads = filteredLeads.filter((l) => l.status === col.name);
            return (
              <div key={col.id} className="flex-shrink-0 w-[280px]">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: `hsl(${col.color})` }}
                  />
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
                      {columnLeads.map((lead, index) => (
                        <Draggable key={lead.id} draggableId={lead.id} index={index}>
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`border shadow-sm transition-shadow ${
                                snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""
                              }`}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-start gap-2">
                                  <div {...provided.dragHandleProps} className="mt-0.5 cursor-grab text-muted-foreground">
                                    <GripVertical className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                                    <p className="text-xs text-muted-foreground">{lead.phone}</p>
                                    {lead.modelInterest && (
                                      <Badge variant="outline" className="mt-1 text-xs">{lead.modelInterest}</Badge>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1">{lead.origin} · {format(lead.createdAt, "dd/MM")}</p>
                                  </div>
                                </div>
                                <div className="flex justify-end gap-1 mt-2 border-t pt-2">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowSendMsg(lead.id)}>
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowHistory(lead.id)}>
                                    <History className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { deleteLead(lead.id); toast.success("Lead removido"); }}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Funnel Settings Dialog */}
      <Dialog open={showFunnelSettings} onOpenChange={setShowFunnelSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar Funil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Colunas do Funil</Label>
              {funnelColumns.map((col) => (
                <div key={col.id} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: `hsl(${col.color})` }} />
                  {editingCol === col.id ? (
                    <>
                      <Input
                        value={editColName}
                        onChange={(e) => setEditColName(e.target.value)}
                        className="h-8 flex-1"
                        onKeyDown={(e) => e.key === "Enter" && handleRenameColumn(col.id)}
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleRenameColumn(col.id)}>✓</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingCol(null)}>✕</Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm flex-1">{col.name}</span>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditingCol(col.id); setEditColName(col.name); }}>
                        Editar
                      </Button>
                      {funnelColumns.length > 1 && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeFunnelColumn(col.id)}>
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t pt-4 space-y-3">
              <Label>Adicionar Coluna</Label>
              <Input
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Nome da coluna"
                onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
              />
              <div className="flex gap-2 flex-wrap">
                {COLUMN_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`h-6 w-6 rounded-full border-2 transition-all ${newColColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: `hsl(${c})` }}
                    onClick={() => setNewColColor(c)}
                  />
                ))}
              </div>
              <Button className="w-full" onClick={handleAddColumn} disabled={!newColName.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Lead Dialog */}
      <Dialog open={showAddLead} onOpenChange={setShowAddLead}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Lead</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" /></div>
            <div><Label>WhatsApp *</Label><Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(11) 99999-9999" /></div>
            <div>
              <Label>Modelo de Interesse</Label>
              <Select value={modelInterest} onValueChange={setModelInterest}>
                <SelectTrigger><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
                <SelectContent>{deviceModels.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
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
            <Button className="w-full" onClick={handleAddLead}>Cadastrar Lead</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog */}
      <Dialog open={!!showSendMsg} onOpenChange={() => setShowSendMsg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar Mensagem WhatsApp</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {connectionStatus !== "connected" && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                WhatsApp não conectado. Configure em "Conectar WhatsApp".
              </div>
            )}
            <div>
              <Label>Mensagem</Label>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Digite sua mensagem..."
              />
            </div>
            <div className="flex gap-2 flex-wrap">
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

      {/* History Dialog */}
      <Dialog open={!!showHistory} onOpenChange={() => setShowHistory(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Histórico de Mensagens</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {showHistory && getLogsForRecipient(showHistory).length === 0 ? (
              <p className="text-center text-muted-foreground py-6">Nenhuma mensagem enviada ainda</p>
            ) : (
              showHistory && getLogsForRecipient(showHistory).map((log) => (
                <div key={log.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{log.templateType}</Badge>
                    <Badge variant={log.status === "sent" ? "default" : "destructive"}>{log.status === "sent" ? "Enviada" : "Falha"}</Badge>
                  </div>
                  <p className="text-sm text-foreground">{log.message}</p>
                  <p className="text-xs text-muted-foreground">{format(log.sentAt, "dd/MM/yyyy HH:mm")}</p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
