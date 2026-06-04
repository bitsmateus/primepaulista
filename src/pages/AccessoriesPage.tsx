import { useState } from "react";
import { Plus, Trash2, Barcode } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { AccessoryCategory, AccessorySubcategory } from "@/types/inventory";
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

const subcategoriesByCategory: Record<AccessoryCategory, AccessorySubcategory[]> = {
  "Capas": ["Silicone", "Couro", "MagSafe", "Space Z"],
  "Películas": ["3D", "Cerâmica", "Privacidade", "Fosca"],
  "Cabos e Fontes": ["Cabo Lightning", "Cabo USB-C", "Fonte 20W", "Fonte 35W"],
};

const COMPATIBLE_MODELS = [
  "Universal",
  "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16", "iPhone 16 Plus",
  "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15", "iPhone 15 Plus",
  "iPhone 14 Pro Max", "iPhone 14 Pro", "iPhone 14", "iPhone 14 Plus",
  "iPhone 13 Pro Max", "iPhone 13 Pro", "iPhone 13", "iPhone 13 Mini",
  "iPhone 12 Pro Max", "iPhone 12 Pro", "iPhone 12", "iPhone 12 Mini",
];

export default function AccessoriesPage() {
  const {
    accessories,
    addAccessory,
    updateAccessoryQuantity,
    deleteAccessory,
    generateBarcode,
  } = useInventoryContext();

  const [open, setOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AccessoryCategory>("Capas");
  const [subcategory, setSubcategory] = useState<AccessorySubcategory>("Silicone");
  const [compatibleModel, setCompatibleModel] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [minQuantity, setMinQuantity] = useState("5");
  const [cost, setCost] = useState("");
  const [barcode, setBarcode] = useState("");

  const resetForm = () => {
    setName(""); setCategory("Capas"); setSubcategory("Silicone");
    setCompatibleModel(""); setQuantity("1"); setMinQuantity("5");
    setCost(""); setBarcode("");
  };

  const handleSubmit = () => {
    if (!name || !compatibleModel) return;
    const code = barcode || generateBarcode();
    addAccessory({
      name,
      category,
      subcategory,
      compatibleModel,
      quantity: Number(quantity),
      minQuantity: Number(minQuantity),
      cost: Number(cost),
      barcode: code,
    });
    resetForm();
    setOpen(false);
  };

  const handleCategoryChange = (cat: AccessoryCategory) => {
    setCategory(cat);
    setSubcategory(subcategoriesByCategory[cat][0]);
  };

  const filteredAccessories =
    filterCategory === "all"
      ? accessories
      : accessories.filter((a) => a.category === filterCategory);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Acessórios</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Periféricos e acessórios por modelo
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Acessório
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Cadastrar Acessório</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2 space-y-2">
                  <Label>Nome do Acessório</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Capa de Silicone iPhone 15 Pro Max"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={category} onValueChange={(v) => handleCategoryChange(v as AccessoryCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Capas">Capas</SelectItem>
                      <SelectItem value="Películas">Películas</SelectItem>
                      <SelectItem value="Cabos e Fontes">Cabos e Fontes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Subcategoria</Label>
                  <Select value={subcategory} onValueChange={(v) => setSubcategory(v as AccessorySubcategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {subcategoriesByCategory[category].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Modelo Compatível</Label>
                  <Select value={compatibleModel} onValueChange={setCompatibleModel}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {COMPATIBLE_MODELS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Custo Unitário (R$)</Label>
                  <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
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
                    <Input
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="Gerado automaticamente"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => setBarcode(generateBarcode())}
                    >
                      <Barcode className="mr-2 h-4 w-4" />
                      Gerar Código
                    </Button>
                  </div>
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
          {["all", "Capas", "Películas", "Cabos e Fontes"].map((c) => (
            <Button
              key={c}
              variant={filterCategory === c ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterCategory(c)}
            >
              {c === "all" ? "Todos" : c}
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
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccessories.map((a) => {
                    const isLow = a.quantity <= a.minQuantity;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">{a.subcategory}</span>
                        </TableCell>
                        <TableCell>{a.compatibleModel}</TableCell>
                        <TableCell className="font-mono text-xs">{a.barcode}</TableCell>
                        <TableCell>
                          {a.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => updateAccessoryQuantity(a.id, Math.max(0, a.quantity - 1))}
                            >
                              −
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">{a.quantity}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => updateAccessoryQuantity(a.id, a.quantity + 1)}
                            >
                              +
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {a.quantity === 0 ? (
                            <Badge variant="destructive">Sem estoque</Badge>
                          ) : isLow ? (
                            <Badge variant="lowStock">Estoque baixo</Badge>
                          ) : (
                            <Badge variant="available">OK</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => deleteAccessory(a.id)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredAccessories.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        Nenhum acessório encontrado.
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
