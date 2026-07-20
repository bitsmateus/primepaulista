import { useState, useMemo } from "react";
import { Search, Smartphone, Package, Download } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { DeviceStatus } from "@/types/inventory";
import { formatCapacity } from "@/lib/utils";
import { daysInStock, deviceMargin, deviceMarginPct } from "@/lib/devices";
import { accessoryStockStatus, accessoryMargin, accessoryMarginPct } from "@/lib/accessories";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusVariantMap: Record<DeviceStatus, "available" | "sold" | "maintenance" | "reserved"> = {
  "Disponível": "available",
  "Vendido": "sold",
  "Em Manutenção": "maintenance",
  "Reservado": "reserved",
};

// Cabeçalho fixo (sticky) para dar sensação de planilha ao rolar
const stickyHead = "sticky top-0 z-10 bg-muted/95 backdrop-blur";

export default function EstoqueGeralPage() {
  const { devices, accessories, devicesLoading, accessoriesLoading } = useInventoryContext();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("devices");

  const q = search.trim().toLowerCase();

  const filteredDevices = useMemo(() => {
    const list = q
      ? devices.filter((d) => {
          const hay = `${d.category} ${d.model} ${d.capacity} ${d.color} ${d.serial} ${d.internalSerial} ${d.serialImei} ${d.imei2} ${d.supplier}`.toLowerCase();
          return hay.includes(q);
        })
      : devices;
    return [...list].sort((a, b) => a.model.localeCompare(b.model));
  }, [devices, q]);

  const filteredAccessories = useMemo(() => {
    const list = q
      ? accessories.filter((a) => {
          const hay = `${a.name} ${a.category} ${a.subcategory} ${a.compatibleModel} ${a.barcode}`.toLowerCase();
          return hay.includes(q);
        })
      : accessories;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [accessories, q]);

  const available = devices.filter((d) => d.status === "Disponível").length;
  const stockValue = isAdmin
    ? devices.reduce((s, d) => s + (d.cost || 0), 0) +
      accessories.reduce((s, a) => s + (a.cost || 0) * a.quantity, 0)
    : 0;
  const accessoryUnits = accessories.reduce((s, a) => s + a.quantity, 0);

  const summary = [
    { label: "Aparelhos", value: devices.length },
    { label: "Disponíveis", value: available },
    { label: "Acessórios (itens)", value: accessories.length },
    { label: "Acessórios (unidades)", value: accessoryUnits },
    ...(isAdmin ? [{ label: "Valor em estoque (custo)", value: fmt(stockValue) }] : []),
  ];

  // ----- Exportar CSV da aba ativa -----
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const downloadCsv = (headers: string[], rows: (string | number)[][], name: string) => {
    const csv = "﻿" + [headers, ...rows].map((r) => r.map(esc).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDevices = () => {
    const headers = [
      "Categoria", "Modelo", "Capacidade", "Cor", "Condição", "Bateria %",
      "Serial", "IMEI 1", "IMEI 2", "Fornecedor",
      ...(isAdmin ? ["Custo", "Margem"] : []), "Preço de venda",
      "Status", "Dias em estoque",
    ];
    const rows = filteredDevices.map((d) => [
      d.category || "iPhone", d.model, d.capacity, d.color, d.condition, d.batteryHealth,
      d.serial || d.internalSerial, d.serialImei || "", d.imei2 || "", d.supplier || "",
      ...(isAdmin ? [d.cost.toFixed(2), deviceMargin(d) != null ? deviceMargin(d)!.toFixed(2) : ""] : []),
      d.salePrice != null ? d.salePrice.toFixed(2) : "",
      d.status, d.status === "Vendido" ? "" : daysInStock(d.entryDate ?? d.createdAt),
    ]);
    downloadCsv(headers, rows, "estoque-aparelhos");
  };

  const exportAccessories = () => {
    const headers = [
      "Nome", "Categoria", "Subcategoria", "Modelo compatível", "Código",
      ...(isAdmin ? ["Custo", "Margem"] : []), "Preço", "Quantidade", "Status",
    ];
    const rows = filteredAccessories.map((a) => [
      a.name, a.category, a.subcategory, a.compatibleModel || "", a.barcode || "",
      ...(isAdmin ? [a.cost.toFixed(2), accessoryMargin(a) != null ? accessoryMargin(a)!.toFixed(2) : ""] : []),
      a.price != null ? a.price.toFixed(2) : "",
      a.quantity, accessoryStockStatus(a),
    ]);
    downloadCsv(headers, rows, "estoque-acessorios");
  };

  const exportCurrent = () => (tab === "devices" ? exportDevices() : exportAccessories());

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Estoque Geral</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visualização completa do estoque — aparelhos e acessórios, como uma planilha.
          </p>
        </div>

        {/* Resumo */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map((c) => (
            <Card key={c.label} className="border shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Busca + exportar */}
        <div className="flex items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar em aparelhos e acessórios..."
              className="pl-9"
            />
          </div>
          <Button variant="outline" onClick={exportCurrent} className="gap-2 shrink-0">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="devices" className="gap-2">
              <Smartphone className="h-4 w-4" /> Aparelhos ({filteredDevices.length})
            </TabsTrigger>
            <TabsTrigger value="accessories" className="gap-2">
              <Package className="h-4 w-4" /> Acessórios ({filteredAccessories.length})
            </TabsTrigger>
          </TabsList>

          {/* Aparelhos */}
          <TabsContent value="devices">
            <Card className="border shadow-none">
              <CardContent className="p-0">
                <div className="max-h-[70vh] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={stickyHead}>Categoria</TableHead>
                        <TableHead className={stickyHead}>Modelo</TableHead>
                        <TableHead className={stickyHead}>Capac.</TableHead>
                        <TableHead className={stickyHead}>Cor</TableHead>
                        <TableHead className={stickyHead}>Condição</TableHead>
                        <TableHead className={stickyHead}>Bateria</TableHead>
                        <TableHead className={stickyHead}>Serial</TableHead>
                        <TableHead className={stickyHead}>IMEI 1</TableHead>
                        <TableHead className={stickyHead}>Fornecedor</TableHead>
                        {isAdmin && <TableHead className={stickyHead}>Custo</TableHead>}
                        <TableHead className={stickyHead}>Preço</TableHead>
                        {isAdmin && <TableHead className={stickyHead}>Margem</TableHead>}
                        <TableHead className={stickyHead}>Dias</TableHead>
                        <TableHead className={stickyHead}>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDevices.map((d, i) => (
                        <TableRow key={d.id} className={i % 2 ? "bg-muted/30" : ""}>
                          <TableCell className="text-muted-foreground">{d.category || "iPhone"}</TableCell>
                          <TableCell className="font-medium">{d.model}</TableCell>
                          <TableCell>{formatCapacity(d.capacity)}</TableCell>
                          <TableCell>{d.color}</TableCell>
                          <TableCell>{d.condition}</TableCell>
                          <TableCell>{d.batteryHealth}%</TableCell>
                          <TableCell className="font-mono text-xs">{d.serial || d.internalSerial}</TableCell>
                          <TableCell className="font-mono text-xs">{d.serialImei || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{d.supplier || "—"}</TableCell>
                          {isAdmin && <TableCell>{fmt(d.cost)}</TableCell>}
                          <TableCell>{d.salePrice != null ? fmt(d.salePrice) : "—"}</TableCell>
                          {isAdmin && (
                            <TableCell>
                              {(() => {
                                const m = deviceMargin(d);
                                if (m == null) return "—";
                                const pct = deviceMarginPct(d) ?? 0;
                                const cls = m < 0 ? "text-destructive" : pct < 15 ? "text-warning" : "text-success";
                                return (
                                  <span className={cls}>
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
                            <Badge variant={statusVariantMap[d.status]}>{d.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredDevices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={isAdmin ? 14 : 12} className="py-8 text-center text-muted-foreground">
                            {devicesLoading ? "Carregando aparelhos…" : "Nenhum aparelho encontrado."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Acessórios */}
          <TabsContent value="accessories">
            <Card className="border shadow-none">
              <CardContent className="p-0">
                <div className="max-h-[70vh] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={stickyHead}>Nome</TableHead>
                        <TableHead className={stickyHead}>Categoria</TableHead>
                        <TableHead className={stickyHead}>Modelo</TableHead>
                        <TableHead className={stickyHead}>Código</TableHead>
                        {isAdmin && <TableHead className={stickyHead}>Custo</TableHead>}
                        <TableHead className={stickyHead}>Preço</TableHead>
                        {isAdmin && <TableHead className={stickyHead}>Margem</TableHead>}
                        <TableHead className={stickyHead}>Qtd</TableHead>
                        <TableHead className={stickyHead}>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAccessories.map((a, i) => {
                        const st = accessoryStockStatus(a);
                        const stVariant = st === "Sem estoque" ? "sold" : st === "Estoque baixo" ? "maintenance" : "available";
                        return (
                          <TableRow key={a.id} className={i % 2 ? "bg-muted/30" : ""}>
                            <TableCell className="font-medium">{a.name}</TableCell>
                            <TableCell className="text-muted-foreground">{a.category} · {a.subcategory}</TableCell>
                            <TableCell>{a.compatibleModel || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{a.barcode || "—"}</TableCell>
                            {isAdmin && <TableCell>{fmt(a.cost)}</TableCell>}
                            <TableCell>{a.price != null ? fmt(a.price) : "—"}</TableCell>
                            {isAdmin && (
                              <TableCell>
                                {(() => {
                                  const m = accessoryMargin(a);
                                  if (m == null) return "—";
                                  const pct = accessoryMarginPct(a) ?? 0;
                                  const cls = m < 0 ? "text-destructive" : pct < 15 ? "text-warning" : "text-success";
                                  return (
                                    <span className={cls}>
                                      {fmt(m)} <span className="text-xs">({pct.toFixed(0)}%)</span>
                                    </span>
                                  );
                                })()}
                              </TableCell>
                            )}
                            <TableCell className="font-medium">{a.quantity}</TableCell>
                            <TableCell>
                              <Badge variant={stVariant}>{st}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredAccessories.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={isAdmin ? 9 : 7} className="py-8 text-center text-muted-foreground">
                            {accessoriesLoading ? "Carregando acessórios…" : "Nenhum acessório encontrado."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
