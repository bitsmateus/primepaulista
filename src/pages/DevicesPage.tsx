import { useState, useMemo, useEffect, useRef } from "react";
import { Plus, ScanLine, Shuffle, Trash2, Pencil, Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { DeviceStatus, DeviceCategory, DeviceCondition, Device } from "@/types/inventory";
import { DEVICE_CATEGORIES, MODELS_BY_CATEGORY, CAPACITIES_BY_CATEGORY } from "@/data/appleCatalog";
import { formatCapacity } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { daysInStock, deviceMargin, deviceMarginPct, buildStockReport } from "@/lib/devices";
import { DevicePhotos } from "@/components/devices/DevicePhotos";
import { parseDevicesCsv, ParsedDeviceCsv } from "@/lib/deviceCsv";
import { Upload } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const statusVariantMap: Record<DeviceStatus, "available" | "sold" | "maintenance" | "reserved"> = {
  "Disponível": "available",
  "Vendido": "sold",
  "Em Manutenção": "maintenance",
  "Reservado": "reserved",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PAGE_SIZE = 20;

export default function DevicesPage() {
  const {
    devices,
    devicesLoading,
    addDevice,
    updateDevice,
    updateDeviceStatus,
    deleteDevice,
    generateInternalSerial,
  } = useInventoryContext();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);

  // Importar CSV
  const [showImport, setShowImport] = useState(false);
  const [parsed, setParsed] = useState<ParsedDeviceCsv | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setParsed(parseDevicesCsv(text));
  };

  const handleConfirmImport = async () => {
    if (!parsed || parsed.devices.length === 0) return;
    setImporting(true);
    let ok = 0;
    let fail = 0;
    for (const d of parsed.devices) {
      try { await addDevice(d); ok++; } catch { fail++; }
    }
    setImporting(false);
    setShowImport(false);
    setParsed(null);
    toast.success(`Importação concluída: ${ok} cadastrados${fail ? `, ${fail} falhas` : ""}.`);
  };

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Form state
  const [category, setCategory] = useState<string>("iPhone");
  const [newCategory, setNewCategory] = useState(""); // ao criar uma categoria manual
  const [model, setModel] = useState("");
  const [capacity, setCapacity] = useState("");
  const [color, setColor] = useState("");
  const [condition, setCondition] = useState<DeviceCondition>("Lacrado");
  const [batteryHealth, setBatteryHealth] = useState("100");
  const [supplier, setSupplier] = useState("");
  const [cost, setCost] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [serialImei, setSerialImei] = useState("");
  const [internalSerial, setInternalSerial] = useState("");
  const [page, setPage] = useState(1);

  const resetForm = () => {
    setCategory("iPhone"); setNewCategory(""); setModel("");
    setCapacity(""); setColor(""); setCondition("Lacrado");
    setBatteryHealth("100"); setSupplier(""); setCost(""); setSalePrice("");
    setSerialImei(""); setInternalSerial("");
  };

  const openCreate = () => {
    resetForm();
    setEditingId(null);
    setOpen(true);
  };

  const openEdit = (d: Device) => {
    setEditingId(d.id);
    setCategory((d.category as DeviceCategory) || "iPhone");
    setModel(d.model);
    setCapacity(d.capacity || "");
    setColor(d.color || "");
    setCondition(d.condition);
    setBatteryHealth(String(d.batteryHealth ?? 100));
    setSupplier(d.supplier || "");
    setCost(String(d.cost ?? ""));
    setSalePrice(d.salePrice != null ? String(d.salePrice) : "");
    setSerialImei(d.serialImei || "");
    setInternalSerial(d.internalSerial || "");
    setOpen(true);
  };

  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!model.trim() || (!serialImei && !internalSerial)) {
      toast.error("Informe o modelo e o serial/IMEI (ou gere um serial interno).");
      return;
    }
    if (Number(cost) < 0 || (salePrice && Number(salePrice) < 0)) {
      toast.error("Custo e preço não podem ser negativos.");
      return;
    }
    const finalCategory = category === "__nova__" ? newCategory.trim() : category;
    if (!finalCategory) {
      toast.error("Informe a categoria.");
      return;
    }
    const payload = {
      category: finalCategory,
      model: model.trim(),
      capacity,
      color,
      condition,
      batteryHealth: Number(batteryHealth),
      supplier,
      cost: Number(cost) || 0,
      salePrice: salePrice ? Number(salePrice) : undefined,
      serialImei,
      internalSerial,
    };
    setSaving(true);
    try {
      if (editingId) {
        await updateDevice(editingId, payload);
        toast.success("Aparelho atualizado!");
      } else {
        await addDevice({ ...payload, status: "Disponível" });
        toast.success("Aparelho cadastrado!");
      }
      resetForm();
      setEditingId(null);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar o aparelho.");
    } finally {
      setSaving(false);
    }
  };

  // ----- Filtros + busca -----
  const filteredDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (filterStatus !== "all" && d.status !== filterStatus) return false;
      if (filterCategory !== "all" && (d.category || "iPhone") !== filterCategory) return false;
      if (q) {
        const hay = `${d.model} ${d.color} ${d.capacity} ${d.serialImei} ${d.internalSerial} ${d.supplier}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [devices, filterStatus, filterCategory, search]);

  // ----- Relatório / resumo -----
  const report = useMemo(() => buildStockReport(devices), [devices]);

  // Categorias = padrão + as criadas manualmente (já usadas em algum aparelho)
  const allCategories = useMemo(() => {
    const set = new Set<string>(DEVICE_CATEGORIES);
    devices.forEach((d) => { if (d.category) set.add(d.category); });
    return Array.from(set);
  }, [devices]);

  // ----- Paginação -----
  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, filterCategory]);
  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / PAGE_SIZE));
  const pageDevices = filteredDevices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ----- Baixar modelo de CSV para importação -----
  const downloadTemplate = () => {
    const headers = "Categoria;Modelo;Capacidade;Cor;Condição;Bateria;Serial/IMEI;Fornecedor;Custo;Preço de venda";
    const exemplo = "iPhone;iPhone 15 Pro;256;Titânio Natural;Lacrado;100;359000000000000;Fornecedor X;6000;7500";
    const csv = "﻿" + headers + "\n" + exemplo + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-importacao-aparelhos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ----- Exportar CSV (lista filtrada) -----
  const exportCSV = () => {
    const headers = [
      "Categoria", "Modelo", "Capacidade", "Cor", "Condição", "Bateria %",
      "Serial/IMEI", "Fornecedor", "Custo", "Preço de venda", "Margem",
      "Status", "Dias em estoque", "Cadastro",
    ];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = filteredDevices.map((d) => [
      d.category || "iPhone", d.model, d.capacity, d.color, d.condition, d.batteryHealth,
      d.serialImei || d.internalSerial, d.supplier || "",
      d.cost.toFixed(2),
      d.salePrice != null ? d.salePrice.toFixed(2) : "",
      deviceMargin(d) != null ? deviceMargin(d)!.toFixed(2) : "",
      d.status, daysInStock(d.createdAt),
      new Date(d.createdAt).toLocaleDateString("pt-BR"),
    ].map((c) => esc(String(c))).join(";"));
    const csv = "﻿" + [headers.map(esc).join(";"), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aparelhos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Aparelhos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Estoque de iPhone, iPad, Apple Watch, Mac, AirPods e outros
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => { setParsed(null); setShowImport(true); }} className="gap-2">
                <Upload className="h-4 w-4" /> Importar CSV
              </Button>
            )}
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Aparelho
            </Button>
          </div>
        </div>

        {/* Resumo / relatório */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Total", value: report.total },
            { label: "Em loja", value: report.inStock },
            { label: "Vendidos", value: report.sold },
            { label: "Em manutenção", value: report.maintenance },
            { label: "Valor em estoque (custo)", value: fmt(report.stockValue) },
            { label: "Margem potencial", value: fmt(report.potentialMargin) },
          ].map((c) => (
            <Card key={c.label} className="border shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quebra por categoria */}
        <div className="flex flex-wrap gap-2">
          {DEVICE_CATEGORIES.filter((c) => report.byCategory[c]).map((c) => (
            <Badge key={c} variant="outline" className="text-xs">
              {c}: {report.byCategory[c]}
            </Badge>
          ))}
        </div>

        {/* Busca + exportar */}
        <div className="flex items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por modelo, IMEI, cor, fornecedor..."
              className="pl-9"
            />
          </div>
          <Button variant="outline" onClick={exportCSV} className="gap-2 shrink-0">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {["Disponível", "Vendido", "Em Manutenção", "Reservado"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(filterCategory !== "all" || filterStatus !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterCategory("all"); setFilterStatus("all"); }}>
              Limpar filtros
            </Button>
          )}
        </div>

        {/* Tabela */}
        <Card className="border shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Capac.</TableHead>
                    <TableHead>Cor</TableHead>
                    <TableHead>Condição</TableHead>
                    <TableHead>Bateria</TableHead>
                    <TableHead>Serial/IMEI</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Margem</TableHead>
                    <TableHead>Dias</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageDevices.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-muted-foreground">{d.category || "iPhone"}</TableCell>
                      <TableCell className="font-medium">{d.model}</TableCell>
                      <TableCell>{formatCapacity(d.capacity)}</TableCell>
                      <TableCell>{d.color}</TableCell>
                      <TableCell>{d.condition}</TableCell>
                      <TableCell>{d.batteryHealth}%</TableCell>
                      <TableCell className="font-mono text-xs">
                        {d.serialImei || d.internalSerial}
                      </TableCell>
                      <TableCell>{fmt(d.cost)}</TableCell>
                      <TableCell>{d.salePrice != null ? fmt(d.salePrice) : "—"}</TableCell>
                      <TableCell>
                        {(() => {
                          const m = deviceMargin(d);
                          if (m == null) return "—";
                          const pct = deviceMarginPct(d) ?? 0;
                          const cls = m < 0 ? "text-destructive" : pct < 15 ? "text-warning" : "text-success";
                          return (
                            <span className={cls} title={pct < 15 && m >= 0 ? "Margem baixa" : undefined}>
                              {fmt(m)} <span className="text-xs">({pct.toFixed(0)}%)</span>
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className={daysInStock(d.createdAt) > 30 ? "text-warning font-medium" : ""}>
                        {d.status === "Vendido" ? "—" : `${daysInStock(d.createdAt)}d`}
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
                              <DropdownMenuItem key={s} onClick={() => updateDeviceStatus(d.id, s)}>
                                {s}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell>
                        <div className="flex">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(d)} title="Editar">
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(d)} title="Excluir">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredDevices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="py-8 text-center text-muted-foreground">
                        {devicesLoading ? "Carregando aparelhos…" : "Nenhum aparelho encontrado."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Paginação */}
        {filteredDevices.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Mostrando {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filteredDevices.length)} de {filteredDevices.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>Página {page} de {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog: criar / editar */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { resetForm(); setEditingId(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Aparelho" : "Cadastrar Aparelho"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={category}
                onValueChange={(v) => { setCategory(v); if (!editingId) { setModel(""); setCapacity(""); } }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  <SelectItem value="__nova__">➕ Nova categoria…</SelectItem>
                </SelectContent>
              </Select>
              {category === "__nova__" && (
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Nome da nova categoria (ex: Caixa de som)"
                  autoFocus
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Modelo</Label>
              <Input
                list="model-suggestions"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Selecione ou digite o modelo"
              />
              <datalist id="model-suggestions">
                {(MODELS_BY_CATEGORY[category as DeviceCategory] || []).map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>Capacidade / Tamanho</Label>
              <Input
                list="capacity-suggestions"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="Ex: 256, 1TB, 45mm…"
              />
              <datalist id="capacity-suggestions">
                {(CAPACITIES_BY_CATEGORY[category as DeviceCategory] || []).map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>Cor</Label>
              <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Ex: Titânio Natural" />
            </div>

            <div className="space-y-2">
              <Label>Condição</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as DeviceCondition)}>
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
              <Input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
            </div>

            <div className="space-y-2">
              <Label>Preço de venda (R$)</Label>
              <Input type="number" min={0} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="0,00 (opcional)" />
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
                <Button variant="outline" type="button" onClick={() => setInternalSerial(generateInternalSerial())}>
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

            {editingId && (
              <div className="col-span-2 border-t pt-3">
                <DevicePhotos deviceId={editingId} />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { resetForm(); setEditingId(null); setOpen(false); }}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Importar CSV */}
      <Dialog open={showImport} onOpenChange={(o) => { setShowImport(o); if (!o) setParsed(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar aparelhos (CSV)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Envie um arquivo CSV com cabeçalho. Colunas reconhecidas:
              <span className="font-medium text-foreground"> Categoria, Modelo, Capacidade, Cor, Condição, Bateria, Serial/IMEI, Fornecedor, Custo, Preço de venda</span>.
              Apenas <strong>Modelo</strong> é obrigatório.
            </p>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" /> Baixar modelo CSV
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleImportFile(e.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            />

            {parsed && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium text-success">{parsed.devices.length} aparelho(s) prontos para importar.</p>
                {parsed.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto text-xs text-destructive">
                    {parsed.errors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowImport(false); setParsed(null); }}>Cancelar</Button>
            <Button onClick={handleConfirmImport} disabled={importing || !parsed || parsed.devices.length === 0}>
              {importing ? "Importando..." : `Importar ${parsed?.devices.length ?? 0}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aparelho?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Tem certeza que deseja excluir <strong>{deleteTarget.model} {formatCapacity(deleteTarget.capacity)} {deleteTarget.color}</strong>?
                  {deleteTarget.status === "Vendido" && " Este aparelho já foi vendido — excluir remove o registro do histórico."}
                  {" "}Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deleteDevice(deleteTarget.id); setDeleteTarget(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
