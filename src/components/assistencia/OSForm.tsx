import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { useServiceOrderContext } from "@/contexts/ServiceOrderContext";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useCRMContext } from "@/contexts/CRMContext";
import { OSPriority } from "@/types/serviceOrder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface OSFormProps {
  onCreated?: () => void;
}

export default function OSForm({ onCreated }: OSFormProps) {
  const { addOrder } = useServiceOrderContext();
  const { customers, accessories, updateAccessoryQuantity } = useInventoryContext();
  const { leads } = useCRMContext();

  // Customer search
  const [custSearch, setCustSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ name: string; phone: string; cpf: string } | null>(null);

  // Device info
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [serialImei, setSerialImei] = useState("");
  const [batteryHealth, setBatteryHealth] = useState("100");

  // Diagnosis
  const [reportedIssue, setReportedIssue] = useState("");
  const [technicalNotes, setTechnicalNotes] = useState("");
  const [checkCapa, setCheckCapa] = useState(false);
  const [checkChip, setCheckChip] = useState(false);
  const [checkCarregador, setCheckCarregador] = useState(false);

  // Repair
  const [priority, setPriority] = useState<OSPriority>("Normal");
  const [partCost, setPartCost] = useState("");
  const [laborCost, setLaborCost] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [chargedAmount, setChargedAmount] = useState("");
  const [taxes, setTaxes] = useState("");
  const [partFromStock, setPartFromStock] = useState(false);
  const [stockAccessoryId, setStockAccessoryId] = useState("");

  // Customer search results
  const filteredCustomers = custSearch.trim()
    ? [
        ...customers.filter((c) => {
          const q = custSearch.toLowerCase();
          return c.name.toLowerCase().includes(q) || c.cpf.includes(q) || c.whatsapp.includes(q);
        }).map((c) => ({ name: c.name, phone: c.whatsapp, cpf: c.cpf })),
        ...leads.filter((l) => {
          const q = custSearch.toLowerCase();
          return l.name.toLowerCase().includes(q) || l.phone.includes(q);
        }).map((l) => ({ name: l.name, phone: l.phone, cpf: "" })),
      ].filter((v, i, a) => a.findIndex((x) => x.phone === v.phone) === i).slice(0, 5)
    : [];

  const handleSubmit = () => {
    if (!selectedCustomer) {
      toast.error("Selecione um cliente");
      return;
    }
    if (!model.trim() || !reportedIssue.trim()) {
      toast.error("Preencha modelo e defeito relatado");
      return;
    }

    // Deduct from stock if needed
    if (partFromStock && stockAccessoryId) {
      const acc = accessories.find((a) => a.id === stockAccessoryId);
      if (acc && acc.quantity > 0) {
        updateAccessoryQuantity(acc.id, acc.quantity - 1);
      }
    }

    addOrder({
      customerName: selectedCustomer.name,
      customerPhone: selectedCustomer.phone,
      customerCpf: selectedCustomer.cpf,
      model,
      color,
      serialImei,
      batteryHealth: Number(batteryHealth),
      reportedIssue,
      technicalNotes,
      checklist: { capa: checkCapa, chip: checkChip, carregador: checkCarregador },
      status: "Aguardando Diagnóstico",
      priority,
      partCost: Number(partCost) || 0,
      laborCost: Number(laborCost) || 0,
      partDescription,
      partFromStock,
      stockAccessoryId: partFromStock ? stockAccessoryId : undefined,
      chargedAmount: Number(chargedAmount) || 0,
      taxes: Number(taxes) || 0,
    });

    toast.success("Ordem de Serviço criada!");
    // Reset form
    setCustSearch(""); setSelectedCustomer(null);
    setModel(""); setColor(""); setSerialImei(""); setBatteryHealth("100");
    setReportedIssue(""); setTechnicalNotes("");
    setCheckCapa(false); setCheckChip(false); setCheckCarregador(false);
    setPriority("Normal"); setPartCost(""); setLaborCost("");
    setPartDescription(""); setChargedAmount(""); setTaxes("");
    setPartFromStock(false); setStockAccessoryId("");

    onCreated?.();
  };

  const calcProfit = (Number(chargedAmount) || 0) - (Number(partCost) || 0) - (Number(taxes) || 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left Column */}
      <div className="space-y-6">
        {/* Customer */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{selectedCustomer.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedCustomer.phone} {selectedCustomer.cpf && `· ${selectedCustomer.cpf}`}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedCustomer(null)}>Trocar</Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, CPF ou WhatsApp..."
                  value={custSearch}
                  onChange={(e) => setCustSearch(e.target.value)}
                  className="pl-10"
                />
                {filteredCustomers.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-lg">
                    {filteredCustomers.map((c, i) => (
                      <button
                        key={i}
                        className="w-full text-left px-4 py-2 hover:bg-accent text-sm"
                        onClick={() => { setSelectedCustomer(c); setCustSearch(""); }}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground ml-2">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Device */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Aparelho</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Modelo *</Label><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="iPhone 14 Pro" /></div>
              <div><Label>Cor</Label><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Space Black" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Serial/IMEI</Label><Input value={serialImei} onChange={(e) => setSerialImei(e.target.value)} /></div>
              <div><Label>Bateria (%)</Label><Input type="number" value={batteryHealth} onChange={(e) => setBatteryHealth(e.target.value)} min="0" max="100" /></div>
            </div>
          </CardContent>
        </Card>

        {/* Diagnosis */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Diagnóstico</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Defeito Relatado *</Label><Textarea value={reportedIssue} onChange={(e) => setReportedIssue(e.target.value)} placeholder="Ex: Tela não liga após queda" /></div>
            <div><Label>Observações Técnicas / Avarias</Label><Textarea value={technicalNotes} onChange={(e) => setTechnicalNotes(e.target.value)} placeholder="Ex: Riscos na lateral direita, vidro traseiro trincado" /></div>
            <div>
              <Label>Checklist de Entrada</Label>
              <div className="flex gap-6 mt-2">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={checkCapa} onCheckedChange={(v) => setCheckCapa(!!v)} />Capa</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={checkChip} onCheckedChange={(v) => setCheckChip(!!v)} />Chip</label>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={checkCarregador} onCheckedChange={(v) => setCheckCarregador(!!v)} />Carregador</label>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column */}
      <div className="space-y-6">
        {/* Repair & Financials */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Reparo & Financeiro</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as OSPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Urgente">Urgente</SelectItem>
                  <SelectItem value="Crítico">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Descrição da Peça</Label><Input value={partDescription} onChange={(e) => setPartDescription(e.target.value)} placeholder="Ex: Tela LCD iPhone 14 Pro" /></div>
            <div className="flex items-center gap-2">
              <Checkbox checked={partFromStock} onCheckedChange={(v) => setPartFromStock(!!v)} />
              <Label className="text-sm">Usar peça do estoque interno</Label>
            </div>
            {partFromStock && (
              <Select value={stockAccessoryId} onValueChange={setStockAccessoryId}>
                <SelectTrigger><SelectValue placeholder="Selecionar peça do estoque" /></SelectTrigger>
                <SelectContent>
                  {accessories.filter((a) => a.quantity > 0).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.quantity} un) — {a.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Custo da Peça (R$)</Label><Input type="number" value={partCost} onChange={(e) => setPartCost(e.target.value)} placeholder="0" /></div>
              <div><Label>Mão de Obra (R$)</Label><Input type="number" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="0" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor Cobrado (R$)</Label><Input type="number" value={chargedAmount} onChange={(e) => setChargedAmount(e.target.value)} placeholder="0" /></div>
              <div><Label>Impostos/Taxas (R$)</Label><Input type="number" value={taxes} onChange={(e) => setTaxes(e.target.value)} placeholder="0" /></div>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Lucro Líquido Estimado</span>
                <span className={`text-sm font-bold ${calcProfit >= 0 ? "text-success" : "text-destructive"}`}>
                  {calcProfit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Cobrado − Custo da Peça − Impostos</p>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" onClick={handleSubmit}>
          <Plus className="h-4 w-4 mr-1" /> Abrir Ordem de Serviço
        </Button>
      </div>
    </div>
  );
}
