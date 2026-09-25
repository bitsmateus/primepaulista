import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, ScanLine, Shuffle, Trash2, Pencil, Search, Download, ChevronLeft, ChevronRight,
  Upload, Tag, Printer, LayoutGrid, List, Store, MoreHorizontal, ClipboardCheck, Eye, Layers, Rows3,
  ArrowUpDown, MapPin, Eraser,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { SupplierSelect } from "@/components/devices/SupplierSelect";
import { can } from "@/lib/permissions";
import { DeviceStatus, DeviceCategory, DeviceCondition, Device } from "@/types/inventory";
import { DEVICE_CATEGORIES, MODELS_BY_CATEGORY, CAPACITIES_BY_CATEGORY } from "@/data/appleCatalog";
import { formatCapacity } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";
import { daysInStock, deviceMargin, deviceMarginPct, buildStockReport, deviceGroupKey } from "@/lib/devices";
import {
  DEVICE_SORT_OPTIONS, DeviceSortKey, allBrands, allLocations, matchesDeviceFilters,
  sortDevices, sortKeepsGroups, summarizeByModel,
} from "@/lib/deviceView";
import { downloadCsv } from "@/lib/download";
import { canonicalModel, modelGroupKey } from "@/lib/modelName";
import { ModelRenameDialog } from "@/components/devices/ModelRenameDialog";
import { DevicePhotos } from "@/components/devices/DevicePhotos";
import { DeviceDetailDialog } from "@/components/devices/DeviceDetailDialog";
import { DeviceImportDialog } from "@/components/devices/DeviceImportDialog";
import { StockCountDialog } from "@/components/devices/StockCountDialog";
import { ModelSummaryView } from "@/components/devices/ModelSummaryView";
import { BarcodeScannerDialog } from "@/components/devices/BarcodeScannerDialog";
import { printDeviceLabel } from "@/utils/labelGenerator";
import { printDeviceCatalog, printDeviceShowcase, printDeviceStockReport } from "@/utils/deviceCatalog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const statusVariantMap: Record<DeviceStatus, "available" | "sold" | "maintenance" | "reserved"> = {
  "Disponível": "available",
  "Vendido": "sold",
  "Em Manutenção": "maintenance",
  "Reservado": "reserved",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PAGE_SIZE = 20;
const CLEAR_PRICE_WORD = "ZERAR";

type ViewMode = "list" | "byModel" | "summary" | "grid";
type ScanTarget = "serialImei" | "imei2" | "serial" | "search";

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
  const qc = useQueryClient();
  const canCost = can(user?.role, "viewCost");
  const canEdit = can(user?.role, "editStock");
  const canImport = can(user?.role, "importStock");
  const canBulk = can(user?.role, "bulkStockActions");
  const canReports = can(user?.role, "viewReports");
  const canDelete = can(user?.role, "deleteRecords");
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailDevice = useMemo(() => devices.find((d) => d.id === detailId) ?? null, [devices, detailId]);

  const [showImport, setShowImport] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [clearPriceOpen, setClearPriceOpen] = useState(false);
  const [clearPriceText, setClearPriceText] = useState("");
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  // Guarda o último alvo para o título não mudar durante a animação de fechar
  const lastScanTarget = useRef<ScanTarget>("search");
  if (scanTarget) lastScanTarget.current = scanTarget;

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [sortKey, setSortKey] = useState<DeviceSortKey>("alphabetical");
  // Estoque separado: aba de lacrados, de seminovos e de vendidos
  const [stockTab, setStockTab] = useState<"Lacrado" | "Seminovo" | "sold">("Lacrado");
  const tab: "active" | "sold" = stockTab === "sold" ? "sold" : "active";
  const [showRename, setShowRename] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");

  // Form state
  const [category, setCategory] = useState<string>("iPhone");
  const [newCategory, setNewCategory] = useState(""); // ao criar uma categoria manual
  const [brand, setBrand] = useState("Apple");
  const [location, setLocation] = useState("Estoque");
  const [model, setModel] = useState("");
  const [capacity, setCapacity] = useState("");
  const [color, setColor] = useState("");
  const [condition, setCondition] = useState<DeviceCondition>("Lacrado");
  const [batteryHealth, setBatteryHealth] = useState("100");
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [cost, setCost] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [serialImei, setSerialImei] = useState(""); // IMEI 1
  const [imei2, setImei2] = useState(""); // IMEI 2
  const [serial, setSerial] = useState(""); // número de série
  const [internalSerial, setInternalSerial] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // data de hoje no formato yyyy-mm-dd (fuso local) para o input date
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const toDateInput = (d?: Date) => {
    if (!d) return "";
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };

  const resetForm = () => {
    setCategory("iPhone"); setNewCategory(""); setBrand("Apple"); setLocation("Estoque"); setModel("");
    setCapacity(""); setColor(""); setCondition("Lacrado");
    setBatteryHealth("100"); setSupplier(""); setCost(""); setSalePrice("");
    setSerialImei(""); setImei2(""); setSerial(""); setInternalSerial(""); setEntryDate(todayStr());
    setNotes("");
  };

  const openCreate = () => {
    resetForm();
    setEditingId(null);
    setOpen(true);
  };

  const openEdit = (d: Device) => {
    setEditingId(d.id);
    setCategory((d.category as DeviceCategory) || "iPhone");
    setBrand(d.brand || "Apple");
    setLocation(d.location || "Estoque");
    setModel(d.model);
    setCapacity(d.capacity || "");
    setColor(d.color || "");
    setCondition(d.condition);
    setBatteryHealth(String(d.batteryHealth ?? 100));
    setSupplier(d.supplier || "");
    setSupplierId(d.supplierId ?? null);
    setCost(String(d.cost ?? ""));
    setSalePrice(d.salePrice != null ? String(d.salePrice) : "");
    setSerialImei(d.serialImei || ""); setImei2(d.imei2 || ""); setSerial(d.serial || "");
    setInternalSerial(d.internalSerial || "");
    setEntryDate(toDateInput(d.entryDate ?? d.createdAt));
    setNotes(d.notes || "");
    setOpen(true);
  };

  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!model.trim() || (!serialImei && !serial && !internalSerial)) {
      toast.error("Informe o modelo e o IMEI/serial (ou gere um serial interno).");
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
      brand: brand.trim() || "Apple",
      location: location.trim() || "Estoque",
      model: model.trim(),
      capacity,
      color,
      condition,
      batteryHealth: Number(batteryHealth),
      supplier,
      supplierId,
      cost: Number(cost) || 0,
      salePrice: salePrice ? Number(salePrice) : undefined,
      serialImei,
      imei2,
      serial,
      internalSerial,
      entryDate: entryDate ? new Date(`${entryDate}T12:00:00`) : undefined,
      notes: notes.trim(),
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

  // ----- Filtros + busca + ordenação -----
  const filters = useMemo(
    () => ({
      tab, search, category: filterCategory, brand: filterBrand,
      condition: stockTab === "sold" ? filterCondition : stockTab, status: filterStatus, location: filterLocation,
    }),
    [tab, stockTab, search, filterCategory, filterBrand, filterCondition, filterStatus, filterLocation]
  );
  const filteredDevices = useMemo(
    () => devices.filter((d) => matchesDeviceFilters(d, filters)),
    [devices, filters]
  );
  const sortedFilteredDevices = useMemo(
    () => sortDevices(filteredDevices, sortKey),
    [filteredDevices, sortKey]
  );
  const modelCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of filteredDevices) {
      const k = modelGroupKey(d.category, d.model);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [filteredDevices]);
  const summaryGroups = useMemo(() => summarizeByModel(sortedFilteredDevices), [sortedFilteredDevices]);

  // Aparelhos vendidos nunca entram nos relatórios/catálogo impressos —
  // só o que está realmente disponível para vender (respeitando os filtros).
  const reportDevices = useMemo(
    () => devices.filter((d) => d.status === "Disponível" && matchesDeviceFilters(d, { ...filters, tab: "active", status: "all" })),
    [devices, filters]
  );

  // ----- Relatório / resumo -----
  const report = useMemo(() => buildStockReport(devices), [devices]);
  const lacrados = useMemo(() => devices.filter((d) => d.status !== "Vendido" && d.condition === "Lacrado").length, [devices]);
  const seminovos = useMemo(() => devices.filter((d) => d.status !== "Vendido" && d.condition === "Seminovo").length, [devices]);
  // Valor de venda do estoque, separado por condição (preço de venda não é sensível)
  const saleValueOf = (cond: "Lacrado" | "Seminovo") =>
    devices.filter((d) => d.status !== "Vendido" && d.condition === cond).reduce((s, d) => s + (d.salePrice ?? 0), 0);
  const lacradosValue = useMemo(() => saleValueOf("Lacrado"), [devices]); // eslint-disable-line react-hooks/exhaustive-deps
  const seminovosValue = useMemo(() => saleValueOf("Seminovo"), [devices]); // eslint-disable-line react-hooks/exhaustive-deps

  // Categorias = padrão + as criadas manualmente (já usadas em algum aparelho)
  const allCategories = useMemo(() => {
    const set = new Set<string>(DEVICE_CATEGORIES);
    devices.forEach((d) => { if (d.category) set.add(d.category); });
    return Array.from(set);
  }, [devices]);
  const brands = useMemo(() => allBrands(devices), [devices]);
  const locations = useMemo(() => allLocations(devices), [devices]);

  // Modelos sugeridos = catálogo da categoria + modelos já cadastrados nessa categoria
  const modelSuggestions = useMemo(() => {
    const set = new Set<string>(MODELS_BY_CATEGORY[category as DeviceCategory] || []);
    devices.forEach((d) => { if ((d.category || "iPhone") === category && d.model) set.add(d.model); });
    return Array.from(set);
  }, [devices, category]);

  // ----- Paginação -----
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [search, filterStatus, filterCategory, filterBrand, filterCondition, filterLocation, sortKey, stockTab]);
  const totalPages = Math.max(1, Math.ceil(sortedFilteredDevices.length / PAGE_SIZE));
  const pageDevices = sortedFilteredDevices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const keepGroups = sortKeepsGroups(sortKey);

  // Grade agrupada por modelo (com contador), respeitando a página atual
  const gridGroups = useMemo(() => {
    const map = new Map<string, Device[]>();
    for (const d of pageDevices) {
      const key = canonicalModel(d.category, d.model) || "Sem modelo";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return [...map.keys()]
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((k) => [k, map.get(k)!] as [string, Device[]]);
  }, [pageDevices]);

  const hasFilters =
    filterCategory !== "all" || filterStatus !== "all" || filterBrand !== "all" ||
    filterCondition !== "all" || filterLocation !== "all";
  const clearFilters = () => {
    setFilterCategory("all"); setFilterStatus("all"); setFilterBrand("all");
    setFilterCondition("all"); setFilterLocation("all");
  };

  // ----- Seleção e mudança de local -----
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const allPageSelected = pageDevices.length > 0 && pageDevices.every((d) => selected.has(d.id));
  const toggleSelectPage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageDevices.forEach((d) => next.delete(d.id));
      else pageDevices.forEach((d) => next.add(d.id));
      return next;
    });

  const moveDevices = async (ids: string[], loc: string) => {
    const target = loc.trim();
    if (!target || ids.length === 0) return;
    try {
      const r = await api.moveDevices(ids, target);
      await qc.invalidateQueries({ queryKey: ["devices"] });
      toast.success(`${r.updated} aparelho(s) movido(s) para "${target}".`);
      setSelected(new Set());
      setMoveTo("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível mover os aparelhos.");
    }
  };

  const clearAllPrices = async () => {
    try {
      const r = await api.clearDeviceSalePrices();
      await qc.invalidateQueries({ queryKey: ["devices"] });
      toast.success(`Preço de venda zerado em ${r.updated} aparelho(s).`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível zerar os preços.");
    } finally {
      setClearPriceOpen(false);
      setClearPriceText("");
    }
  };

  const handleScanned = (code: string) => {
    if (scanTarget === "serialImei") setSerialImei(code);
    else if (scanTarget === "imei2") setImei2(code);
    else if (scanTarget === "serial") setSerial(code);
    else if (scanTarget === "search") {
      setSearch(code);
      toast.message("Busca filtrada pelo código lido.", { description: code });
    }
  };

  // ----- Exportar CSV (lista filtrada) -----
  const exportCSV = () => {
    const headers = [
      "Categoria", "Marca", "Modelo", "Capacidade", "Cor", "Condição", "Bateria %",
      "IMEI 1", "IMEI 2", "Serial", "Local", "Fornecedor",
      ...(canCost ? ["Custo", "Margem"] : []), "Preço de venda",
      "Status", "Dias em estoque", "Data de entrada", "Cadastro",
    ];
    const rows = sortedFilteredDevices.map((d) => [
      d.category || "iPhone", d.brand, d.model, d.capacity, d.color, d.condition, d.batteryHealth,
      d.serialImei || "", d.imei2 || "", d.serial || d.internalSerial, d.location, d.supplier || "",
      ...(canCost ? [d.cost.toFixed(2), deviceMargin(d) != null ? deviceMargin(d)!.toFixed(2) : ""] : []),
      d.salePrice != null ? d.salePrice.toFixed(2) : "",
      d.status, daysInStock(d.entryDate ?? d.createdAt),
      new Date(d.entryDate ?? d.createdAt).toLocaleDateString("pt-BR"),
      new Date(d.createdAt).toLocaleDateString("pt-BR"),
    ]);
    downloadCsv(`aparelhos-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const printLabel = (d: Device) =>
    printDeviceLabel({
      model: d.model, capacity: d.capacity, batteryHealth: d.batteryHealth,
      color: d.color, serial: d.serial || d.internalSerial || d.serialImei,
    });

  // checkbox + 12 colunas fixas (+ custo e margem para admin)
  const colCount = 13 + (canCost ? 2 : 0);

  // Local do aparelho: clicar abre um menu para movê-lo
  const renderLocation = (d: Device) =>
    d.status === "Vendido" ? (
      <span className="text-muted-foreground">{d.location}</span>
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted" title="Clique para mover de local">
            <MapPin className="h-3 w-3 text-muted-foreground" /> {d.location}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Mover para…</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {locations.map((l) => (
            <DropdownMenuItem key={l} disabled={l === d.location} onClick={() => moveDevices([d.id], l)}>
              {l}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Aparelhos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Estoque de iPhone, iPad, Apple Watch, Mac, AirPods e outros
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canImport && (
              <Button variant="outline" onClick={() => setShowImport(true)} className="gap-2">
                <Upload className="h-4 w-4" /> Importar CSV / Excel
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowCount(true)} className="gap-2">
              <ClipboardCheck className="h-4 w-4" /> Balanço
            </Button>
            {canBulk && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" title="Mais ações" aria-label="Mais ações">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowRename(true)} className="gap-2">
                    <Layers className="h-4 w-4" /> Padronizar nomes de modelos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setClearPriceOpen(true)} className="gap-2 text-destructive">
                    <Eraser className="h-4 w-4" /> Zerar preço de venda de todos
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canEdit && (
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Aparelho
              </Button>
            )}
          </div>
        </div>

        {/* Resumo / relatório */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total", value: report.total },
            { label: "Em loja", value: report.inStock },
            { label: "Lacrados (em estoque)", value: lacrados },
            { label: "Seminovos (em estoque)", value: seminovos },
            { label: "Valor de venda — lacrados", value: fmt(lacradosValue) },
            { label: "Valor de venda — seminovos", value: fmt(seminovosValue) },
            { label: "Vendidos", value: report.sold },
            { label: "Em manutenção", value: report.maintenance },
            ...(canCost
              ? [
                  { label: "Valor em estoque (custo)", value: fmt(report.stockValue) },
                  { label: "Margem potencial", value: fmt(report.potentialMargin) },
                ]
              : []),
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
          {allCategories.filter((c) => report.byCategory[c]).map((c) => (
            <Badge key={c} variant="outline" className="text-xs">
              {c}: {report.byCategory[c]}
            </Badge>
          ))}
        </div>

        {/* Abas: estoque de lacrados, de seminovos e vendidos (cada um separado) */}
        <Tabs value={stockTab} onValueChange={(v) => { setStockTab(v as "Lacrado" | "Seminovo" | "sold"); setFilterCondition("all"); setFilterStatus("all"); }}>
          <TabsList>
            <TabsTrigger value="Lacrado" className="gap-2">
              Lacrados
              <Badge variant="secondary">{lacrados}</Badge>
            </TabsTrigger>
            <TabsTrigger value="Seminovo" className="gap-2">
              Seminovos
              <Badge variant="secondary">{seminovos}</Badge>
            </TabsTrigger>
            <TabsTrigger value="sold" className="gap-2">
              Vendidos
              <Badge variant="secondary">{report.sold}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Busca + exportar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por modelo, IMEI, cor, fornecedor..."
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setScanTarget("search")}
              title="Escanear para filtrar estoque"
              aria-label="Escanear para filtrar estoque"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ScanLine className="h-4 w-4" />
            </button>
          </div>
          <Button variant="outline" onClick={() => printDeviceShowcase(reportDevices)} className="gap-2 shrink-0" title="Vitrine só com aparelhos disponíveis, para enviar ao cliente">
            <Store className="h-4 w-4" /> Vitrine (cliente)
          </Button>
          <Button variant="outline" onClick={() => printDeviceCatalog(reportDevices, canCost)} className="gap-2 shrink-0" title="Catálogo só com aparelhos disponíveis (vendidos não entram)">
            <Printer className="h-4 w-4" /> Catálogo (A4)
          </Button>
          {canReports && (
            <Button
              variant="outline"
              onClick={() => printDeviceStockReport(reportDevices)}
              className="gap-2 shrink-0"
              title="Relatório com cor, modelo, condição, bateria, serial, IMEI e custo — só aparelhos disponíveis, para conferência de estoque"
            >
              <Printer className="h-4 w-4" /> Relatório de Estoque
            </Button>
          )}
          <Button variant="outline" onClick={exportCSV} className="gap-2 shrink-0">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-44" aria-label="Categoria"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-40" aria-label="Marca"><SelectValue placeholder="Marca" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as marcas</SelectItem>
              {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          {stockTab === "sold" && (
            <Select value={filterCondition} onValueChange={setFilterCondition}>
              <SelectTrigger className="w-44" aria-label="Condição"><SelectValue placeholder="Condição" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as condições</SelectItem>
                <SelectItem value="Lacrado">Novo / Lacrado</SelectItem>
                <SelectItem value="Seminovo">Seminovo</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={filterLocation} onValueChange={setFilterLocation}>
            <SelectTrigger className="w-44" aria-label="Local"><SelectValue placeholder="Local" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os locais</SelectItem>
              {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          {tab === "active" && (
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44" aria-label="Status"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {["Disponível", "Em Manutenção", "Reservado"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}
        </div>

        {/* Ordenação + modo de visualização */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as DeviceSortKey)}>
              <SelectTrigger className="w-72" aria-label="Ordem do estoque"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEVICE_SORT_OPTIONS.filter((o) => !o.adminOnly || canCost).map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-xs text-muted-foreground">
            {filteredDevices.length} aparelho(s) em {modelCounts.size} modelo(s)
          </span>
          <div className="ml-auto flex items-center gap-1 rounded-lg border p-0.5" role="group" aria-label="Modo de visualização">
            {([
              ["list", "Lista", List],
              ["byModel", "Por modelo", Rows3],
              ["summary", "Resumo", Layers],
              ["grid", "Grade", LayoutGrid],
            ] as const).map(([mode, label, Icon]) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "secondary" : "ghost"}
                size="sm"
                className="h-7 gap-1 px-2"
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
              >
                <Icon className="h-4 w-4" /> {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Barra de ações em lote */}
        {selected.size > 0 && (viewMode === "list" || viewMode === "byModel") && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2" data-testid="bulk-bar">
            <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
            <Input
              list="move-location-suggestions"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              placeholder="Mover para… (ex.: Vitrine 1)"
              className="h-8 w-56"
            />
            <datalist id="move-location-suggestions">
              {locations.map((l) => <option key={l} value={l} />)}
            </datalist>
            <Button size="sm" className="gap-1" disabled={!moveTo.trim()} onClick={() => moveDevices([...selected], moveTo)}>
              <MapPin className="h-4 w-4" /> Mover
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
          </div>
        )}

        {/* Visualizações */}
        {viewMode === "summary" ? (
          <ModelSummaryView
            groups={summaryGroups}
            showCost={canCost}
            loading={devicesLoading}
            onSelectDevice={(d) => setDetailId(d.id)}
          />
        ) : viewMode === "grid" ? (
          <div className="space-y-6">
            {gridGroups.map(([model, list]) => (
              <div key={model} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{model}</h3>
                  <Badge variant="outline" className="text-xs">{list.length} un</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {list.map((d) => {
                    const days = daysInStock(d.entryDate ?? d.createdAt);
                    const m = canCost ? deviceMargin(d) : null;
                    return (
                      <Card key={d.id} className="border shadow-none">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <button type="button" onClick={() => setDetailId(d.id)} className="truncate text-left font-semibold text-foreground hover:underline">
                                {canonicalModel(d.category, d.model) || d.model}
                              </button>
                              <p className="text-xs text-muted-foreground">{formatCapacity(d.capacity)}{d.color ? ` · ${d.color}` : ""}</p>
                            </div>
                            <Badge variant={statusVariantMap[d.status]} className="shrink-0">{d.status}</Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>{d.condition}</span>
                            <span>Bateria {d.batteryHealth}%</span>
                            <span>{d.location}</span>
                            {d.status !== "Vendido" && <span className={days > 30 ? "text-warning font-medium" : ""}>{days}d em estoque</span>}
                          </div>
                          {(d.serialImei || d.serial || d.internalSerial) && (
                            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{d.serialImei || d.serial || d.internalSerial}</p>
                          )}
                          <div className="mt-3 flex items-end justify-between">
                            <div>
                              <p className="text-base font-semibold text-foreground">{d.salePrice != null ? fmt(d.salePrice) : "—"}</p>
                              {m != null && <p className="text-xs text-muted-foreground">Margem {fmt(m)}</p>}
                            </div>
                            <div className="flex">
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver ficha do aparelho" onClick={() => setDetailId(d.id)}>
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Imprimir etiqueta" onClick={() => printLabel(d)}>
                                <Tag className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" disabled={!canEdit} onClick={() => openEdit(d)}>
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              {canDelete && d.status !== "Vendido" && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Excluir" onClick={() => setDeleteTarget(d)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredDevices.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                {devicesLoading ? "Carregando aparelhos…" : "Nenhum aparelho encontrado."}
              </p>
            )}
          </div>
        ) : (
          <Card className="border shadow-none">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={allPageSelected}
                          onCheckedChange={toggleSelectPage}
                          aria-label="Selecionar todos da página"
                        />
                      </TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Capac.</TableHead>
                      <TableHead>Cor</TableHead>
                      <TableHead>Condição</TableHead>
                      <TableHead>Bateria</TableHead>
                      <TableHead>Serial</TableHead>
                      <TableHead>Local</TableHead>
                      {canCost && <TableHead>Custo</TableHead>}
                      <TableHead>Preço</TableHead>
                      {canCost && <TableHead>Margem</TableHead>}
                      <TableHead>Dias</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-28"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageDevices.map((d, idx) => {
                      const prev = pageDevices[idx - 1];
                      const newModel = !prev || modelGroupKey(prev.category, prev.model) !== modelGroupKey(d.category, d.model);
                      return (
                        <Fragment key={d.id}>
                          {viewMode === "byModel" && newModel && (
                            <TableRow className="bg-muted/40 hover:bg-muted/40" data-testid="model-header">
                              <TableCell colSpan={colCount} className="py-2">
                                <span className="text-sm font-semibold text-foreground">{canonicalModel(d.category, d.model) || d.model}</span>
                                <Badge variant="outline" className="ml-2 text-xs">{modelCounts.get(modelGroupKey(d.category, d.model)) ?? 0} un</Badge>
                              </TableCell>
                            </TableRow>
                          )}
                          {viewMode === "list" && keepGroups && idx > 0 && deviceGroupKey(prev) !== deviceGroupKey(d) && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={colCount} className="h-3 border-0 p-0" />
                            </TableRow>
                          )}
                          <TableRow data-state={selected.has(d.id) ? "selected" : undefined}>
                            <TableCell>
                              <Checkbox
                                checked={selected.has(d.id)}
                                onCheckedChange={() => toggleSelect(d.id)}
                                aria-label={`Selecionar ${d.model}`}
                              />
                            </TableCell>
                            <TableCell className="text-muted-foreground">{d.category || "iPhone"}</TableCell>
                            <TableCell className="font-medium">
                              <button type="button" onClick={() => setDetailId(d.id)} className="text-left hover:underline" title="Ver ficha do aparelho">
                                {d.brand && d.brand !== "Apple" && <span className="text-muted-foreground">{d.brand} </span>}
                                {canonicalModel(d.category, d.model) || d.model}
                              </button>
                            </TableCell>
                            <TableCell>{formatCapacity(d.capacity)}</TableCell>
                            <TableCell>{d.color}</TableCell>
                            <TableCell>{d.condition}</TableCell>
                            <TableCell>{d.batteryHealth}%</TableCell>
                            <TableCell className="font-mono text-xs">
                              {d.serial || d.internalSerial}
                            </TableCell>
                            <TableCell>{renderLocation(d)}</TableCell>
                            {canCost && <TableCell>{fmt(d.cost)}</TableCell>}
                            <TableCell>{d.salePrice != null ? fmt(d.salePrice) : "—"}</TableCell>
                            {canCost && (
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
                            )}
                            <TableCell className={daysInStock(d.entryDate ?? d.createdAt) > 30 ? "text-warning font-medium" : ""}>
                              {d.status === "Vendido" ? "—" : `${daysInStock(d.entryDate ?? d.createdAt)}d`}
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
                                <Button variant="ghost" size="icon" title="Ver ficha do aparelho" onClick={() => setDetailId(d.id)}>
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Imprimir etiqueta" onClick={() => printLabel(d)}>
                                  <Tag className="h-4 w-4 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => openEdit(d)} disabled={!canEdit} title="Editar">
                                  <Pencil className="h-4 w-4 text-muted-foreground" />
                                </Button>
                                {canDelete && d.status !== "Vendido" && (
                                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(d)} title="Excluir">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        </Fragment>
                      );
                    })}
                    {filteredDevices.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={colCount} className="py-8 text-center text-muted-foreground">
                          {devicesLoading ? "Carregando aparelhos…" : "Nenhum aparelho encontrado."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Paginação (o Resumo mostra tudo de uma vez) */}
        {viewMode !== "summary" && filteredDevices.length > 0 && (
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
              <Label>Marca</Label>
              <Input
                list="brand-suggestions"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Apple, Samsung, Xiaomi…"
              />
              <datalist id="brand-suggestions">
                {brands.map((b) => <option key={b} value={b} />)}
              </datalist>
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
                {modelSuggestions.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>Localização</Label>
              <Input
                list="location-suggestions"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Estoque, Vitrine 1…"
              />
              <datalist id="location-suggestions">
                {locations.map((l) => <option key={l} value={l} />)}
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
              <SupplierSelect
                value={{ supplierId, name: supplier }}
                onChange={(v) => { setSupplier(v.name); setSupplierId(v.supplierId); }}
                canCreate={can(user?.role, "manageSuppliers")}
                ariaLabel="Fornecedor"
              />
            </div>

            <div className="space-y-2">
              <Label>Data de entrada</Label>
              <Input type="date" value={entryDate} max={todayStr()} onChange={(e) => setEntryDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">Dia da compra no fornecedor.</p>
            </div>

            {canCost && (
              <div className="space-y-2">
                <Label>Custo (R$)</Label>
                <Input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
              </div>
            )}

            <div className="space-y-2">
              <Label>Preço de venda (R$)</Label>
              <Input type="number" min={0} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="0,00 (opcional)" />
            </div>

            <div className="col-span-2 space-y-2">
              <Label className="text-base font-semibold">Serial</Label>
              <div className="flex gap-2">
                <Input
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  placeholder="Número de série do aparelho"
                  className="h-11 flex-1 text-base font-semibold"
                />
                <Button variant="outline" type="button" className="h-11" title="Escanear número de série com a câmera" aria-label="Escanear serial" onClick={() => setScanTarget("serial")}>
                  <ScanLine className="h-4 w-4" />
                </Button>
                <Button variant="outline" type="button" className="h-11" onClick={() => setInternalSerial(generateInternalSerial())}>
                  <Shuffle className="mr-2 h-4 w-4" />
                  Gerar código
                </Button>
              </div>
              {internalSerial && (
                <p className="text-xs text-muted-foreground">
                  Serial interno: <span className="font-mono font-medium text-foreground">{internalSerial}</span>
                </p>
              )}
            </div>
            <div className="col-span-2 space-y-2">
              <Label className="text-base font-semibold">IMEI 1</Label>
              <div className="flex gap-2">
                <Input
                  value={serialImei}
                  onChange={(e) => setSerialImei(e.target.value)}
                  placeholder="Escaneie ou digite o IMEI 1"
                  className="h-11 flex-1 text-base font-semibold"
                />
                <Button variant="outline" type="button" className="h-11" title="Escanear IMEI 1 com a câmera" aria-label="Escanear IMEI 1" onClick={() => setScanTarget("serialImei")}>
                  <ScanLine className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="col-span-2 space-y-2">
              <Label className="text-base font-semibold">IMEI 2</Label>
              <div className="flex gap-2">
                <Input
                  value={imei2}
                  onChange={(e) => setImei2(e.target.value)}
                  placeholder="IMEI 2 (dual SIM, se houver)"
                  className="h-11 flex-1 text-base font-semibold"
                />
                <Button variant="outline" type="button" className="h-11" title="Escanear IMEI 2 com a câmera" aria-label="Escanear IMEI 2" onClick={() => setScanTarget("imei2")}>
                  <ScanLine className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: peça trocada, avarias..."
                rows={2}
              />
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

      <DeviceImportDialog open={showImport} onOpenChange={setShowImport} devices={devices} />
      <ModelRenameDialog open={showRename} onOpenChange={setShowRename} devices={devices} />
      <StockCountDialog open={showCount} onOpenChange={setShowCount} devices={devices} showCost={canCost} />
      <DeviceDetailDialog
        device={detailDevice}
        onClose={() => setDetailId(null)}
        onEdit={openEdit}
        showCost={canCost}
      />
      <BarcodeScannerDialog
        open={scanTarget !== null}
        onOpenChange={(o) => { if (!o) setScanTarget(null); }}
        onDetected={handleScanned}
        title={
          lastScanTarget.current === "serialImei" ? "Escanear IMEI 1"
          : lastScanTarget.current === "imei2" ? "Escanear IMEI 2"
          : lastScanTarget.current === "serial" ? "Escanear número de série"
          : "Escanear para filtrar estoque"
        }
        description="Aponte a câmera para o código de barras ou IMEI no aparelho ou na caixa."
      />

      {/* Zerar preços (irreversível) */}
      <AlertDialog open={clearPriceOpen} onOpenChange={(o) => { setClearPriceOpen(o); if (!o) setClearPriceText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zerar o preço de venda de todo o estoque?</AlertDialogTitle>
            <AlertDialogDescription>
              O preço de venda de todos os aparelhos não vendidos será removido. <strong>Atenção:</strong> no PDV,
              aparelho sem preço de venda aparece pelo preço de <strong>custo</strong>, então defina os novos preços
              antes de vender. Esta ação não pode ser desfeita. Digite <strong>{CLEAR_PRICE_WORD}</strong> para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={clearPriceText}
            onChange={(e) => setClearPriceText(e.target.value)}
            placeholder={CLEAR_PRICE_WORD}
            aria-label="Confirmação"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearPriceText.trim().toUpperCase() !== CLEAR_PRICE_WORD}
              onClick={(e) => {
                if (clearPriceText.trim().toUpperCase() !== CLEAR_PRICE_WORD) { e.preventDefault(); return; }
                void clearAllPrices();
              }}
            >
              Zerar preços
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aparelho?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Tem certeza que deseja excluir <strong>{deleteTarget.model} {formatCapacity(deleteTarget.capacity)} {deleteTarget.color}</strong>?
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
