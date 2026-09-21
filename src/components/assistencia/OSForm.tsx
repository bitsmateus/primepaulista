import { useState } from "react";
import { Search, Plus, Store } from "lucide-react";
import { useServiceOrderContext } from "@/contexts/ServiceOrderContext";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useCRMContext } from "@/contexts/CRMContext";
import { useAuth } from "@/contexts/AuthContext";
import { canSeeCost } from "@/lib/permissions";
import { OSPriority, OSOrigin, CostResponsibility } from "@/types/serviceOrder";
import { OS_ORIGINS, COST_RESPONSIBILITIES, isExempt, chargedFieldLabel, isOpenOS } from "@/lib/serviceOrders";
import { Device } from "@/types/inventory";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
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
  const { addOrder, orders } = useServiceOrderContext();
  const { customers, accessories, devices } = useInventoryContext();
  const { leads } = useCRMContext();
  const { user } = useAuth();
  const showCost = canSeeCost(user?.role);

  // Customer search
  const [custSearch, setCustSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ id?: string; name: string; phone: string; cpf: string } | null>(null);

  const deviceModels = [...new Set(devices.map((d) => d.model))];

  // Device info
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [serialImei, setSerialImei] = useState(""); // IMEI 1
  const [imei2, setImei2] = useState(""); // IMEI 2
  const [serial, setSerial] = useState(""); // número de série
  const [batteryHealth, setBatteryHealth] = useState("100");

  // Diagnosis
  const [reportedIssue, setReportedIssue] = useState("");
  const [technicalNotes, setTechnicalNotes] = useState("");
  const [checkCapa, setCheckCapa] = useState(false);
  const [checkChip, setCheckChip] = useState(false);
  const [checkCarregador, setCheckCarregador] = useState(false);

  // Origem: aparelho do cliente ou do estoque da loja
  const [origin, setOrigin] = useState<OSOrigin>("Cliente");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [costResp, setCostResp] = useState<CostResponsibility>("Cliente");
  const fromStock = origin === "Estoque da loja";
  const exempt = isExempt(costResp);

  // Aparelhos do estoque disponíveis para OS: não vendidos e fora de outra OS aberta
  const busyDeviceIds = new Set(orders.filter((o) => isOpenOS(o) && o.deviceId).map((o) => o.deviceId as string));
  const deviceResults = (() => {
    const q = deviceSearch.trim().toLowerCase();
    if (!q) return [];
    return devices
      .filter((d) => d.status !== "Vendido" && !busyDeviceIds.has(d.id))
      .filter((d) =>
        [d.model, d.color, d.capacity, d.serialImei, d.imei2, d.serial, d.internalSerial]
          .some((v) => (v ?? "").toLowerCase().includes(q))
      )
      .slice(0, 8);
  })();

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
        }).map((c) => ({ id: c.id, name: c.name, phone: c.whatsapp, cpf: c.cpf })),
        ...leads.filter((l) => {
          const q = custSearch.toLowerCase();
          return l.name.toLowerCase().includes(q) || l.phone.includes(q);
        }).map((l) => ({ id: undefined, name: l.name, phone: l.phone, cpf: "" })),
      ].filter((v, i, a) => a.findIndex((x) => x.phone === v.phone) === i).slice(0, 5)
    : [];

  const handleSubmit = async () => {
    if (fromStock) {
      if (!selectedDevice) {
        toast.error("Escolha o aparelho do estoque");
        return;
      }
      if (!reportedIssue.trim()) {
        toast.error("Preencha o defeito / serviço a realizar");
        return;
      }
    } else {
      if (!selectedCustomer) {
        toast.error("Selecione um cliente");
        return;
      }
      if (!model.trim() || !reportedIssue.trim()) {
        toast.error("Preencha modelo e defeito relatado");
        return;
      }
    }

    // A baixa da peça do estoque é feita pelo backend, de forma transacional
    try {
      await addOrder({
        origin,
        deviceId: fromStock ? selectedDevice!.id : undefined,
        costResponsibility: costResp,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name ?? "",
        customerPhone: selectedCustomer?.phone ?? "",
        customerCpf: selectedCustomer?.cpf ?? "",
        // OS de estoque: o servidor preenche modelo/cor/IMEI/serial a partir do aparelho
        model: fromStock ? selectedDevice!.model : model,
        color: fromStock ? selectedDevice!.color : color,
        serialImei: fromStock ? selectedDevice!.serialImei ?? "" : serialImei,
        imei2: fromStock ? selectedDevice!.imei2 ?? "" : imei2,
        serial: fromStock ? selectedDevice!.serial ?? "" : serial,
        batteryHealth: fromStock ? selectedDevice!.batteryHealth : Number(batteryHealth),
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
        chargedAmount: exempt ? 0 : Number(chargedAmount) || 0,
        taxes: Number(taxes) || 0,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Falha ao criar a OS.");
      return;
    }

    toast.success("Ordem de Serviço criada!");
    // Reset form
    setCustSearch(""); setSelectedCustomer(null);
    setModel(""); setColor(""); setSerialImei(""); setImei2(""); setSerial(""); setBatteryHealth("100");
    setReportedIssue(""); setTechnicalNotes("");
    setCheckCapa(false); setCheckChip(false); setCheckCarregador(false);
    setPriority("Normal"); setPartCost(""); setLaborCost("");
    setPartDescription(""); setChargedAmount(""); setTaxes("");
    setPartFromStock(false); setStockAccessoryId("");
    setOrigin("Cliente"); setDeviceSearch(""); setSelectedDevice(null); setCostResp("Cliente");

    onCreated?.();
  };

  const calcProfit = (exempt ? 0 : Number(chargedAmount) || 0) - (Number(partCost) || 0) - (Number(taxes) || 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left Column */}
      <div className="space-y-6">
        {/* Customer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{fromStock ? "Cliente (opcional)" : "Cliente"}</CardTitle>
            {fromStock && <p className="text-xs text-muted-foreground">Aparelho da própria loja: só informe um cliente se ele for avisado quando ficar pronto.</p>}
          </CardHeader>
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

        {/* Origem */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Origem do aparelho</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={origin} onValueChange={(v) => { setOrigin(v as OSOrigin); setSelectedDevice(null); setDeviceSearch(""); }}>
              <SelectTrigger aria-label="Origem da OS"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OS_ORIGINS.map((o) => <SelectItem key={o} value={o}>{o === "Cliente" ? "Aparelho do cliente" : "Estoque da loja"}</SelectItem>)}
              </SelectContent>
            </Select>
            {fromStock && (
              <p className="text-xs text-muted-foreground">
                Ao abrir a OS o aparelho passa para <strong>Em Manutenção</strong> e local <strong>Assistência</strong>; ao entregar/finalizar ele volta ao estoque.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Device */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Aparelho</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {fromStock ? (
              selectedDevice ? (
                <div className="flex items-center justify-between rounded-lg border p-3" data-testid="os-selected-device">
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2"><Store className="h-4 w-4" />{selectedDevice.model} {/^d+$/.test(selectedDevice.capacity) ? `${selectedDevice.capacity}GB` : selectedDevice.capacity}</p>
                    <p className="text-xs text-muted-foreground">{selectedDevice.color} · IMEI/Serial: {selectedDevice.serialImei || selectedDevice.serial || "—"}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">Local: {selectedDevice.location} · <Badge variant="outline" className="text-[10px]">{selectedDevice.status}</Badge></div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedDevice(null)}>Trocar</Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar aparelho do estoque"
                    placeholder="Buscar por modelo, IMEI ou serial..."
                    value={deviceSearch}
                    onChange={(e) => setDeviceSearch(e.target.value)}
                    className="pl-10"
                  />
                  {deviceSearch.trim() && (
                    <div className="mt-1 w-full rounded-lg border bg-popover shadow-sm" data-testid="os-device-results">
                      {deviceResults.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum aparelho disponível encontrado.</p>
                      ) : deviceResults.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          className="w-full text-left px-4 py-2 hover:bg-accent text-sm"
                          onClick={() => { setSelectedDevice(d); setDeviceSearch(""); }}
                        >
                          <span className="font-medium">{d.model} {d.capacity}</span>
                          <span className="text-muted-foreground ml-2">{d.color} · {d.serialImei || d.serial || "sem IMEI"} · {d.location}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : (<>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Modelo *</Label>
                <Input list="os-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="iPhone 14 Pro" />
                <datalist id="os-models">{deviceModels.map((m) => <option key={m} value={m} />)}</datalist>
              </div>
              <div><Label>Cor</Label><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Space Black" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-base font-semibold">IMEI 1</Label><Input value={serialImei} onChange={(e) => setSerialImei(e.target.value)} placeholder="IMEI 1" className="h-11 text-base font-semibold" /></div>
              <div><Label className="text-base font-semibold">IMEI 2</Label><Input value={imei2} onChange={(e) => setImei2(e.target.value)} placeholder="IMEI 2 (dual SIM)" className="h-11 text-base font-semibold" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-base font-semibold">Serial</Label><Input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Número de série" className="h-11 text-base font-semibold" /></div>
              <div><Label>Bateria (%)</Label><Input type="number" value={batteryHealth} onChange={(e) => setBatteryHealth(e.target.value)} min="0" max="100" /></div>
            </div>
            </>)}
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
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.quantity} un){showCost ? ` — ${a.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Custo da Peça (R$)</Label><Input type="number" value={partCost} onChange={(e) => setPartCost(e.target.value)} placeholder="0" /></div>
              <div><Label>Mão de Obra (R$)</Label><Input type="number" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="0" /></div>
            </div>
            <div>
              <Label>Quem paga o custo</Label>
              <Select value={costResp} onValueChange={(v) => setCostResp(v as CostResponsibility)}>
                <SelectTrigger aria-label="Quem paga o custo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COST_RESPONSIBILITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="os-charged">{chargedFieldLabel(costResp)}</Label>
                <Input id="os-charged" type="number" value={exempt ? "0" : chargedAmount} disabled={exempt} onChange={(e) => setChargedAmount(e.target.value)} placeholder="0" />
                {exempt && <p className="mt-1 text-xs text-muted-foreground">Coberto pela loja: nada é cobrado do cliente.</p>}
              </div>
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
