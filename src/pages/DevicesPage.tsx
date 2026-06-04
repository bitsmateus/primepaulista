import { useState } from "react";
import { Plus, ScanLine, Shuffle, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { DeviceStatus } from "@/types/inventory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusVariantMap: Record<DeviceStatus, "available" | "sold" | "maintenance" | "reserved"> = {
  "Disponível": "available",
  "Vendido": "sold",
  "Em Manutenção": "maintenance",
  "Reservado": "reserved",
};

const MODELS = [
  "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16 Plus", "iPhone 16",
  "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15 Plus", "iPhone 15",
  "iPhone 14 Pro Max", "iPhone 14 Pro", "iPhone 14 Plus", "iPhone 14",
  "iPhone 13 Pro Max", "iPhone 13 Pro", "iPhone 13 Mini", "iPhone 13",
  "iPhone 12 Pro Max", "iPhone 12 Pro", "iPhone 12 Mini", "iPhone 12",
  "iPhone SE (3ª geração)", "iPhone SE (2ª geração)",
];

const CUSTOM_MODEL_VALUE = "__custom__";

const CAPACITIES = ["64", "128", "256", "512", "1024"];

export default function DevicesPage() {
  const {
    devices,
    addDevice,
    updateDeviceStatus,
    deleteDevice,
    generateInternalSerial,
  } = useInventoryContext();

  const [open, setOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form state
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [capacity, setCapacity] = useState("");
  const [color, setColor] = useState("");
  const [condition, setCondition] = useState<"Lacrado" | "Seminovo">("Lacrado");
  const [batteryHealth, setBatteryHealth] = useState("100");
  const [supplier, setSupplier] = useState("");
  const [cost, setCost] = useState("");
  const [serialImei, setSerialImei] = useState("");
  const [internalSerial, setInternalSerial] = useState("");

  const resetForm = () => {
    setModel(""); setCustomModel(""); setIsCustomModel(false);
    setCapacity(""); setColor(""); setCondition("Lacrado");
    setBatteryHealth("100"); setSupplier(""); setCost("");
    setSerialImei(""); setInternalSerial("");
  };

  const handleSubmit = () => {
    const finalModel = isCustomModel ? customModel : model;
    if (!finalModel || !capacity || (!serialImei && !internalSerial)) return;
    addDevice({
      model: finalModel,
      capacity,
      color,
      condition,
      batteryHealth: Number(batteryHealth),
      supplier,
      cost: Number(cost),
      serialImei,
      internalSerial,
      status: "Disponível",
    });
    resetForm();
    setOpen(false);
  };

  const filteredDevices =
    filterStatus === "all"
      ? devices
      : devices.filter((d) => d.status === filterStatus);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Aparelhos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gerencie o estoque de iPhones
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Aparelho
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Cadastrar Aparelho</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  {isCustomModel ? (
                    <div className="flex gap-2">
                      <Input
                        value={customModel}
                        onChange={(e) => setCustomModel(e.target.value)}
                        placeholder="Digite o modelo manualmente"
                      />
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => { setIsCustomModel(false); setCustomModel(""); }}
                      >
                        Lista
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Select value={model} onValueChange={setModel}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {MODELS.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => { setIsCustomModel(true); setModel(""); }}
                      >
                        Manual
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Capacidade (GB)</Label>
                  <Select value={capacity} onValueChange={setCapacity}>
                    <SelectTrigger><SelectValue placeholder="GB" /></SelectTrigger>
                    <SelectContent>
                      {CAPACITIES.map((c) => (
                        <SelectItem key={c} value={c}>{c} GB</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Cor</Label>
                  <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Ex: Titânio Natural" />
                </div>

                <div className="space-y-2">
                  <Label>Condição</Label>
                  <Select value={condition} onValueChange={(v) => setCondition(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lacrado">Lacrado</SelectItem>
                      <SelectItem value="Seminovo">Seminovo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Saúde da Bateria (%)</Label>
                  <Input type="number" min={0} max={100} value={batteryHealth} onChange={(e) => setBatteryHealth(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Fornecedor</Label>
                  <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nome do fornecedor" />
                </div>

                <div className="space-y-2">
                  <Label>Custo (R$)</Label>
                  <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label>Serial / IMEI</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={serialImei}
                        onChange={(e) => setSerialImei(e.target.value)}
                        placeholder="Escaneie ou digite o IMEI"
                        className="pr-10"
                      />
                      <ScanLine className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => setInternalSerial(generateInternalSerial())}
                    >
                      <Shuffle className="mr-2 h-4 w-4" />
                      Gerar Serial
                    </Button>
                  </div>
                  {internalSerial && (
                    <p className="text-xs text-muted-foreground">
                      Serial interno: <span className="font-mono font-medium text-foreground">{internalSerial}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { resetForm(); setOpen(false); }}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit}>Cadastrar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {["all", "Disponível", "Vendido", "Em Manutenção", "Reservado"].map((s) => (
            <Button
              key={s}
              variant={filterStatus === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(s)}
            >
              {s === "all" ? "Todos" : s}
            </Button>
          ))}
        </div>

        {/* Table */}
        <Card className="border shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Modelo</TableHead>
                    <TableHead>GB</TableHead>
                    <TableHead>Cor</TableHead>
                    <TableHead>Condição</TableHead>
                    <TableHead>Bateria</TableHead>
                    <TableHead>Serial/IMEI</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDevices.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.model}</TableCell>
                      <TableCell>{d.capacity}</TableCell>
                      <TableCell>{d.color}</TableCell>
                      <TableCell>{d.condition}</TableCell>
                      <TableCell>{d.batteryHealth}%</TableCell>
                      <TableCell className="font-mono text-xs">
                        {d.serialImei || d.internalSerial}
                      </TableCell>
                      <TableCell>
                        {d.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="cursor-pointer">
                              <Badge variant={statusVariantMap[d.status]}>{d.status}</Badge>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {(["Disponível", "Vendido", "Em Manutenção", "Reservado"] as DeviceStatus[]).map((s) => (
                              <DropdownMenuItem
                                key={s}
                                onClick={() => updateDeviceStatus(d.id, s)}
                              >
                                {s}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteDevice(d.id)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredDevices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                        Nenhum aparelho encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
