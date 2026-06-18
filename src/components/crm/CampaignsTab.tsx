import { useState, useRef } from "react";
import { Send, FileText, Shield, Clock, X } from "lucide-react";
import { useCRMContext } from "@/contexts/CRMContext";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { buildRecipients, filterRecipients, personalizeMessage } from "@/lib/crm";

const TEMPLATES = [
  { id: "receipt", label: "Recibo de Venda", icon: FileText, message: "Olá {nome}! Segue o recibo da sua compra na Prime Paulista. Obrigado pela preferência! 🍎" },
  { id: "warranty", label: "Termo de Garantia", icon: Shield, message: "Olá {nome}! Segue o termo de garantia do seu aparelho adquirido na Prime Paulista. Guarde com carinho! 📋" },
  { id: "followup7", label: "Pós-venda 7 dias", icon: Clock, message: "Olá {nome}! Já faz 1 semana desde a sua compra. Tudo certinho com o aparelho? Qualquer dúvida, estamos aqui! 😊" },
  { id: "followup30", label: "Pós-venda 30 dias", icon: Clock, message: "Olá {nome}! Já faz 1 mês desde a sua compra na Prime Paulista. Como está seu aparelho? Precisando de algo, é só chamar! 📱" },
  { id: "followup90", label: "Pós-venda 90 dias", icon: Clock, message: "Olá {nome}! Passaram 3 meses desde sua compra. Esperamos que esteja adorando! Temos novidades na loja, vem conferir! 🎉" },
];

export default function CampaignsTab() {
  const {
    leads, sendMessage, sendMedia, uploadCampaignImage, addMessageLog, connectionStatus, messageLogs,
    instances, selectedInstanceId, setSelectedInstanceId,
  } = useCRMContext();
  const { customers, devices } = useInventoryContext();

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [filterModel, setFilterModel] = useState<string>("all");
  const [filterOrigin, setFilterOrigin] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [intervalMs, setIntervalMs] = useState(3000);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);

  const handleImageUpload = async (file: File) => {
    setUploadingImg(true);
    try {
      setImageUrl(await uploadCampaignImage(file));
      toast.success("Imagem anexada!");
    } catch {
      toast.error("Falha ao enviar imagem.");
    } finally {
      setUploadingImg(false);
    }
  };
  const cancelRef = useRef(false);

  const allRecipients = buildRecipients(leads, customers);
  const filteredRecipients = filterRecipients(allRecipients, { model: filterModel, origin: filterOrigin });
  const deviceModels = [...new Set(devices.map((d) => d.model))];
  const origins = [...new Set(allRecipients.map((r) => r.origin).filter(Boolean))];

  // Selecionados que ainda estão visíveis no filtro atual (contador coerente)
  const selectedInView = filteredRecipients.filter((r) => selectedIds.has(r.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedInView.length === filteredRecipients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecipients.map((r) => r.id)));
    }
  };

  const getMessage = () =>
    selectedTemplate ? TEMPLATES.find((t) => t.id === selectedTemplate)?.message || "" : customMessage;

  const handleBulkSend = async () => {
    const msg = getMessage();
    if (!msg.trim()) { toast.error("Defina uma mensagem"); return; }
    if (selectedInView.length === 0) { toast.error("Selecione pelo menos um destinatário"); return; }
    if (connectionStatus !== "connected") { toast.error("WhatsApp não conectado"); return; }

    cancelRef.current = false;
    setSending(true);
    let sent = 0, failed = 0;
    const recipients = selectedInView;
    setProgress({ done: 0, total: recipients.length });

    for (let i = 0; i < recipients.length; i++) {
      if (cancelRef.current) break;
      const r = recipients[i];
      const personalizedMsg = personalizeMessage(msg, r.name);
      const success = imageUrl
        ? await sendMedia(r.phone, imageUrl, personalizedMsg)
        : await sendMessage(r.phone, personalizedMsg);
      addMessageLog({
        recipientId: r.source === "lead" ? r.id : null,
        recipientName: r.name, recipientPhone: r.phone,
        templateType: selectedTemplate || "Campanha",
        message: personalizedMsg, status: success ? "sent" : "failed",
      });
      if (success) sent++; else failed++;
      setProgress({ done: i + 1, total: recipients.length });
      if (i < recipients.length - 1 && !cancelRef.current) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    setSending(false);
    setProgress(null);
    setSelectedIds(new Set());
    const cancelled = cancelRef.current;
    toast.success(`${cancelled ? "Disparo cancelado" : "Disparo concluído"}: ${sent} enviadas, ${failed} falhas`);
  };

  return (
    <div className="space-y-6">
      {/* Número e imagem */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Número e Imagem</CardTitle>
          <CardDescription>Escolha de qual número sai o disparo e anexe uma imagem (opcional)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Disparar pelo número</Label>
            <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
              <SelectTrigger><SelectValue placeholder="Selecione um número" /></SelectTrigger>
              <SelectContent>
                {instances.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}{i.configured ? "" : " (sem credenciais)"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Imagem (opcional)</Label>
            <div className="flex items-center gap-2">
              <Input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
              {imageUrl && <Button variant="ghost" size="sm" onClick={() => setImageUrl(null)}>Remover</Button>}
            </div>
            {uploadingImg && <p className="mt-1 text-xs text-muted-foreground">Enviando imagem…</p>}
            {imageUrl && <img src={imageUrl} alt="prévia" className="mt-2 max-h-24 rounded border" />}
          </div>
        </CardContent>
      </Card>

      {/* Modelos de mensagem */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Modelos de Mensagem</CardTitle>
          <CardDescription>Selecione um template ou escreva uma mensagem personalizada</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              const isSelected = selectedTemplate === tpl.id;
              return (
                <button
                  key={tpl.id}
                  onClick={() => { setSelectedTemplate(isSelected ? null : tpl.id); setCustomMessage(""); }}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                    isSelected ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-center text-xs font-medium">{tpl.label}</span>
                </button>
              );
            })}
          </div>

          {selectedTemplate ? (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium text-muted-foreground mb-1">Preview:</p>
              <p>{TEMPLATES.find((t) => t.id === selectedTemplate)?.message}</p>
            </div>
          ) : (
            <div>
              <Label>Mensagem Personalizada</Label>
              <Textarea
                className="mt-1 min-h-[100px]"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Use {nome} para personalizar. Ex: Olá {nome}, temos novidades!"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Segmentação e destinatários */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Segmentação e Destinatários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label>Filtrar por Modelo</Label>
              <Select value={filterModel} onValueChange={setFilterModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os modelos</SelectItem>
                  {deviceModels.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Filtrar por Origem</Label>
              <Select value={filterOrigin} onValueChange={setFilterOrigin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  {origins.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label>Intervalo (ms)</Label>
              <Input type="number" value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))} min={1000} step={500} />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedInView.length === filteredRecipients.length && filteredRecipients.length > 0}
                onCheckedChange={selectAll}
              />
              <span className="text-sm text-muted-foreground">
                {selectedInView.length} de {filteredRecipients.length} selecionados
              </span>
            </div>
            <div className="flex items-center gap-2">
              {sending && progress && (
                <span className="text-sm text-muted-foreground">{progress.done}/{progress.total}</span>
              )}
              {sending ? (
                <Button variant="destructive" onClick={() => { cancelRef.current = true; }}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
              ) : (
                <Button onClick={handleBulkSend} disabled={selectedInView.length === 0 || connectionStatus !== "connected"}>
                  <Send className="h-4 w-4 mr-1" /> Disparar em Massa
                </Button>
              )}
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {filteredRecipients.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground">Nenhum destinatário encontrado</p>
            ) : (
              filteredRecipients.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/50 transition-colors">
                  <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.phone}</p>
                  </div>
                  {r.model && <Badge variant="secondary" className="text-xs">{r.model}</Badge>}
                  <Badge variant="outline" className="text-xs">{r.source === "lead" ? "Lead" : "Cliente"}</Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Histórico geral de disparos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Últimos Disparos</CardTitle>
          <CardDescription>Histórico das mensagens enviadas</CardDescription>
        </CardHeader>
        <CardContent>
          {messageLogs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma mensagem enviada ainda</p>
          ) : (
            <div className="max-h-[300px] space-y-2 overflow-y-auto">
              {messageLogs.slice(0, 50).map((log) => (
                <div key={log.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{log.recipientName || log.recipientPhone}</p>
                      <Badge variant="secondary" className="text-xs">{log.templateType}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{log.message}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={log.status === "sent" ? "default" : "destructive"} className="text-xs">
                      {log.status === "sent" ? "Enviada" : "Falha"}
                    </Badge>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{format(log.sentAt, "dd/MM HH:mm")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
