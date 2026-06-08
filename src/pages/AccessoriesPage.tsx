import { useState, useMemo } from "react";
import { Plus, Trash2, Barcode, Pencil, Search, Minus } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { AccessoryCategory, AccessorySubcategory, Accessory } from "@/types/inventory";
import { MODELS_BY_CATEGORY } from "@/data/appleCatalog";
import {
  accessoryStockStatus,
  accessoryMargin,
  accessoryMarginPct,
  buildAccessoryReport,
  StockStatus,
} from "@/lib/accessories";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const subcategoriesByCategory: Record<AccessoryCategory, AccessorySubcategory[]> = {
  "Capas": ["Silicone", "Couro", "MagSafe", "Space Z"],
  "Películas": ["3D", "Cerâmica", "Privacidade", "Fosca"],
  "Cabos e Fontes": ["Cabo Lightning", "Cabo USB-C", "Fonte 20W", "Fonte 35W"],
};
const CATEGORIES: AccessoryCategory[] = ["Capas", "Películas", "Cabos e Fontes"];
const STATUSES: StockStatus[] = ["OK", "Estoque baixo", "Sem estoque"];

// Sugestões de modelo compatível (o usuário também pode digitar)
const COMPATIBLE_MODELS = [
  "Universal",
  ...MODELS_BY_CATEGORY.iPhone,
  ...MODELS_BY_CATEGORY.iPad,
  ...MODELS_BY_CATEGORY["Apple Watch"],
];

const statusBadge = (st: StockStatus) =>
  st === "Sem estoque" ? <Badge variant="destructive">Sem estoque</Badge>
  : st === "Estoque baixo" ? <Badge variant="lowStock">Estoque baixo</Badge>
  : <Badge variant="available">OK</Badge>;

export default function AccessoriesPage() {
  const {
    accessories,
    accessoriesLoading,
    addAccessory,
    updateAccessoryQuantity,
    updateAccessory,
    deleteAccessory,
    generateBarcode,
  } = useInventoryContext();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<Accessory | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AccessoryCategory>("Capas");
  const [subcategory, setSubcategory] = useState<AccessorySubcategory>("Silicone");
  const [compatibleModel, setCompatibleModel] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [minQuantity, setMinQuantity] = useState("5");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [barcode, setBarcode] = useState("");

  const resetForm = () => {
    setName(""); setCategory("Capas"); setSubcategory("Silicone");
    setCompatibleModel(""); setQuantity("1"); setMinQuantity("5");
    setCost(""); setPrice(""); setBarcode("");
  };

  const openCreate = () => { resetForm(); setEditingId(null); setOpen(true); };

  const openEdit = (a: Accessory) => {
    setEditingId(a.id);
    setName(a.name);
    setCategory(a.category);
    setSubcategory(a.subcategory as AccessorySubcategory);
    setCompatibleModel(a.compatibleModel || "");
    setQuantity(String(a.quantity));
    setMinQuantity(String(a.minQuantity));
    setCost(String(a.cost ?? ""));
    setPrice(a.price != null ? String(a.price) : "");
    setBarcode(a.barcode || "");
    setOpen(true);
  };

  const handleCategoryChange = (cat: AccessoryCategory) => {
    setCategory(cat);
    if (!subcategoriesByCategory[cat].includes(subcategory)) {
      setSubcategory(subcategoriesByCategory[cat][0]);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !compatibleModel.trim()) {
      toast.error("Informe o nome e o modelo compatível.");
      return;
    }
    if (Number(cost) < 0 || (price && Number(price) < 0)) {
      toast.error("Custo e preço não podem ser negativos.");
      return;
    }
    const payload = {
      name: name.trim(),
      category,
      subcategory,
      compatibleModel: compatibleModel.trim(),
      quantity: Number(quantity) || 0,
      minQuantity: Number(minQuantity) || 0,
      cost: Number(cost) || 0,
      price: price ? Number(price) : undefined,
      barcode: barcode || generateBarcode(),
    };
    setSaving(true);
    try {
      if (editingId) {
        await updateAccessory(editingId, payload);
        toast.success("Acessório atualizado!");
      } else {
        await addAccessory(payload);
        toast.success("Acessório cadastrado!");
      }
      resetForm();
      setEditingId(null);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar o acessório.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accessories.filter((a) => {
      if (filterCategory !== "all" && a.category !== filterCategory) return false;
      if (filterStatus !== "all" && accessoryStockStatus(a) !== filterStatus) return false;
      if (q) {
        const hay = `${a.name} ${a.subcategory} ${a.compatibleModel} ${a.barcode}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [accessories, filterCategory, filterStatus, search]);

  const report = useMemo(() => buildAccessoryReport(accessories), [accessories]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Acessórios</h1>
            <p className="mt-1 text-sm text-muted-foreground">Periféricos e acessórios por modelo</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Novo Acessório
          </Button>
        </div>

        {/* Resumo */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Itens distintos", value: report.distinct },
            { label: "Unidades em estoque", value: report.totalUnits },
            ...(isAdmin
              ? [
                  { label: "Valor em estoque (custo)", value: fmt(report.stockValue) },
                  { label: "Margem potencial", value: fmt(report.potentialMargin) },
                ]
              : []),
            { label: "Estoque baixo / zerado", value: `${report.lowStock} / ${report.outOfStock}` },
          ].map((c) => (
            <Card key={c.label} className="border shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Busca + filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, modelo, código..."
              className="pl-9"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {(filterCategory !== "all" || filterStatus !== "all" || search) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterCategory("all"); setFilterStatus("all"); setSearch(""); }}>
              Limpar
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
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Código</TableHead>
                    {isAdmin && <TableHead>Custo</TableHead>}
                    <TableHead>Preço</TableHead>
                    {isAdmin && <TableHead>Margem</TableHead>}
                    <TableHead>Qtd</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-muted-foreground">{a.category} · {a.subcategory}</TableCell>
                      <TableCell>{a.compatibleModel}</TableCell>
                      <TableCell className="font-mono text-xs">{a.barcode}</TableCell>
                      {isAdmin && <TableCell>{fmt(a.cost)}</TableCell>}
                      <TableCell>{a.price != null ? fmt(a.price) : "—"}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          {(() => {
                            const m = accessoryMargin(a);
                            if (m == null) return "—";
                            const pct = accessoryMarginPct(a) ?? 0;
                            const cls = m < 0 ? "text-destructive" : pct < 15 ? "text-warning" : "text-success";
                            return <span className={cls}>{fmt(m)} <span className="text-xs">({pct.toFixed(0)}%)</span></span>;
                          })()}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Button variant="outline" size="icon" className="h-7 w-7"
                            onClick={() => updateAccessoryQuantity(a.id, Math.max(0, a.quantity - 1))}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-7 text-center text-sm font-medium">{a.quantity}</span>
                          <Button variant="outline" size="icon" className="h-7 w-7"
                            onClick={() => updateAccessoryQuantity(a.id, a.quantity + 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{statusBadge(accessoryStockStatus(a))}</TableCell>
                      <TableCell>
                        <div className="flex">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(a)} title="Editar">
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(a)} title="Excluir">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 10 : 8} className="py-8 text-center text-muted-foreground">
                        {accessoriesLoading ? "Carregando acessórios…" : "Nenhum acessório encontrado."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog: criar / editar */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { resetForm(); setEditingId(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Acessório" : "Cadastrar Acessório"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label>Nome do Acessório</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Capa de Silicone iPhone 15 Pro Max" />
            </div>

            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v) => handleCategoryChange(v as AccessoryCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Subcategoria</Label>
              <Select value={subcategory} onValueChange={(v) => setSubcategory(v as AccessorySubcategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {subcategoriesByCategory[category].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Modelo Compatível</Label>
              <Input
                list="compat-models"
                value={compatibleModel}
                onChange={(e) => setCompatibleModel(e.target.value)}
                placeholder="Selecione ou digite (ex: Universal)"
              />
              <datalist id="compat-models">
                {COMPATIBLE_MODELS.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <Label>Custo Unitário (R$)</Label>
                <Input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
              </div>
            )}

            <div className="space-y-2">
              <Label>Preço de venda (R$)</Label>
              <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00 (opcional)" />
            </div>

            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Qtd. Mínima (Alerta)</Label>
              <Input type="number" min={0} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} />
            </div>

            <div className="col-span-2 space-y-2">
              <Label>Código de Barras</Label>
              <div className="flex gap-2">
                <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Gerado automaticamente" className="flex-1" />
                <Button variant="outline" type="button" onClick={() => setBarcode(generateBarcode())}>
                  <Barcode className="mr-2 h-4 w-4" /> Gerar Código
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { resetForm(); setEditingId(null); setOpen(false); }}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir acessório?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>Tem certeza que deseja excluir <strong>{deleteTarget.name}</strong>? Esta ação não pode ser desfeita.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deleteAccessory(deleteTarget.id); setDeleteTarget(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
