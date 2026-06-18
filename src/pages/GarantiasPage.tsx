import { useState, useMemo } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { buildWarrantyRecords, warrantyMatchesSearch, warrantyLabel } from "@/lib/warranty";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function GarantiasPage() {
  const { sales, salesLoading } = useInventoryContext();
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const now = new Date();
  const records = useMemo(() => buildWarrantyRecords(sales, now), [sales]);
  const filtered = records.filter(
    (r) => warrantyMatchesSearch(r, search) && (!onlyActive || r.active)
  );
  const activeCount = records.filter((r) => r.active).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Consulta de Garantia</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Busque por IMEI/serial, cliente ou modelo para ver até quando o aparelho está na garantia
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Aparelhos vendidos", value: records.length },
            { label: "Na garantia", value: activeCount },
            { label: "Garantia expirada", value: records.length - activeCount },
          ].map((c) => (
            <Card key={c.label} className="border shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por IMEI, cliente ou modelo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant={onlyActive ? "default" : "outline"} size="sm" className="gap-2" onClick={() => setOnlyActive((v) => !v)}>
            <ShieldCheck className="h-4 w-4" /> Só na garantia
          </Button>
          <Badge variant="secondary" className="ml-auto self-center">{filtered.length} registros</Badge>
        </div>

        <Card className="border shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Aparelho</TableHead>
                    <TableHead>IMEI/Serial</TableHead>
                    <TableHead>Venda</TableHead>
                    <TableHead>Garantia</TableHead>
                    <TableHead>Válida até</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r, i) => (
                    <TableRow key={`${r.saleId}-${i}`}>
                      <TableCell className="font-medium">{r.customerName}</TableCell>
                      <TableCell>{r.model}</TableCell>
                      <TableCell className="font-mono text-xs">{r.serial || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.saleDate.toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>{warrantyLabel(r.days)}</TableCell>
                      <TableCell>{r.days ? r.until.toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell>
                        {r.active ? (
                          <Badge variant="default" className="bg-success text-success-foreground hover:bg-success/90">
                            Na garantia · {r.daysLeft}d
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Expirada</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        {salesLoading ? "Carregando…" : "Nenhum aparelho encontrado."}
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
