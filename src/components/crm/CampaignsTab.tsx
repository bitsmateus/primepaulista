import { useState } from "react";
import { Megaphone, Send, FileText, Shield, Clock, Filter } from "lucide-react";
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
import { toast } from "sonner";

const TEMPLATES = [
  { id: "receipt", label: "Recibo de Venda", icon: FileText, message: "Olá {nome}! Segue o recibo da sua compra na Prime Paulista. Obrigado pela preferência! 🍎" },
  { id: "warranty", label: "Termo de Garantia", icon: Shield, message: "Olá {nome}! Segue o termo de garantia do seu aparelho adquirido na Prime Paulista. Guarde com carinho! 📋" },
  { id: "followup7", label: "Pós-venda 7 dias", icon: Clock, message: "Olá {nome}! Já faz 1 semana desde a sua compra. Tudo certinho com o aparelho? Qualquer dúvida, estamos aqui! 😊" },
  { id: "followup30", label: "Pós-venda 30 dias", icon: Clock, message: "Olá {nome}! Já faz 1 mês desde a sua compra na Prime Paulista. Como está seu aparelho? Precisando de algo, é só chamar! 📱" },
  { id: "followup90", label: "Pós-venda 90 dias", icon: Clock, message: "Olá {nome}! Passaram 3 meses desde sua compra. Esperamos que esteja adorando! Temos novidades na loja, vem conferir! 🎉" },
];

export default function CampaignsTab() {
  const { leads, sendMessage, addMessageLog, connectionStatus } = useCRMContext();
  const { customers, devices } = useInventoryContext();

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [filterModel, setFilterModel] = useState<string>("all");
  const [filterOrigin, setFilterOrigin] = useState<string>("all");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [intervalMs, setIntervalMs] = useState(3000);

  // Combine leads + customers as possible recipients
  const allRecipients = [
    ...leads.map((l) => ({ id: l.id, name: l.name, phone: l.phone, model: l.modelInterest, origin: l.origin, source: "lead" as const })),
    ...customers.map((c) => ({ id: c.id, name: c.name, phone: c.whatsapp, model: "", origin: c.leadOrigin, source: "customer" as const })),
  ];

  const filteredRecipients = allRecipients.filter((r) => {
    if (filterModel !== "all" && !r.model.toLowerCase().includes(filterModel.toLowerCase())) return false;
    if (filterOrigin !== "all" && r.origin !== filterOrigin) return false;
    return true;
  });

  const deviceModels = [...new Set(devices.map((d) => d.model))];
  const origins = [...new Set(allRecipients.map((r) => r.origin).filter(Boolean))];

  const toggleSelect = (id: string) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedLeads.size === filteredRecipients.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filteredRecipients.map((r) => r.id)));
    }
  };

  const getMessage = () => {
    if (selectedTemplate) {
      const tpl = TEMPLATES.find((t) => t.id === selectedTemplate);
      return tpl?.message || "";
    }
    return customMessage;
  };

  const handleBulkSend = async () => {
    const msg = getMessage();
    if (!msg.trim()) { toast.error("Defina uma mensagem"); return; }
    if (selectedLeads.size === 0) { toast.error("Selecione pelo menos um destinatário"); return; }
    if (connectionStatus !== "connected") { toast.error("WhatsApp não conectado"); return; }

    setSending(true);
    let sent = 0;
    let failed = 0;
    const recipients = filteredRecipients.filter((r) => selectedLeads.has(r.id));

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      const personalizedMsg = msg.replace(/{nome}/g, r.name.split(" ")[0]);
      const success = await sendMessage(r.phone, personalizedMsg);
      addMessageLog({
        recipientId: r.id,
        recipientName: r.name,
        recipientPhone: r.phone,
        templateType: selectedTemplate || "Campanha",
        message: personalizedMsg,
        status: success ? "sent" : "failed",
      });
      if (success) sent++; else failed++;
      // Intervalo entre mensagens para evitar bloqueio
      if (i < recipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    setSending(false);
    setSelectedLeads(new Set());
    toast.success(`Disparo concluído: ${sent} enviadas, ${failed} falhas`);
  };

  return (
    <div className="space-y-6">
      {/* Templates */}
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

          {selectedTemplate && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium text-muted-foreground mb-1">Preview:</p>
              <p>{TEMPLATES.find((t) => t.id === selectedTemplate)?.message}</p>
            </div>
          )}

          {!selectedTemplate && (
            <div>
              <Label>Mensagem Personalizada</Label>
              <textarea
                className="mt-1 flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Use {nome} para personalizar. Ex: Olá {nome}, temos novidades!"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters & Recipients */}
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
                  {deviceModels.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Filtrar por Origem</Label>
              <Select value={filterOrigin} onValueChange={setFilterOrigin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  {origins.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label>Intervalo (ms)</Label>
              <Input
                type="number"
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                min={1000}
                step={500}
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedLeads.size === filteredRecipients.length && filteredRecipients.length > 0}
                onCheckedChange={selectAll}
              />
              <span className="text-sm text-muted-foreground">
                {selectedLeads.size} de {filteredRecipients.length} selecionados
              </span>
            </div>
            <Button
              onClick={handleBulkSend}
              disabled={sending || selectedLeads.size === 0 || connectionStatus !== "connected"}
            >
              {sending ? (
                <>Enviando...</>
              ) : (
                <><Send className="h-4 w-4 mr-1" /> Disparar em Massa</>
              )}
            </Button>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {filteredRecipients.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground">Nenhum destinatário encontrado</p>
            ) : (
              filteredRecipients.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={selectedLeads.has(r.id)}
                    onCheckedChange={() => toggleSelect(r.id)}
                  />
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
    </div>
  );
}
