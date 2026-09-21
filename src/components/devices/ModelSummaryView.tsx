import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Device } from "@/types/inventory";
import { ModelSummary } from "@/lib/deviceView";
import { formatCapacity } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  groups: ModelSummary[];
  isAdmin: boolean;
  loading?: boolean;
  onSelectDevice: (d: Device) => void;
}

// "Categorização do estoque por modelo e condição": uma linha por
// modelo + capacidade + condição, com quantidade e faixa de preço.
// Clicar na linha mostra as unidades individuais.
export function ModelSummaryView({ groups, isAdmin, loading, onSelectDevice }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const totalUnits = groups.reduce((s, g) => s + g.qty, 0);
  const cols = isAdmin ? 8 : 7;

  return (
    <Card className="border shadow-none">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Estoque por modelo e condição</h3>
          <span className="text-xs text-muted-foreground">
            {totalUnits} aparelho(s) em {groups.length} grupo(s)
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Capac.</TableHead>
                <TableHead>Condição</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead>Preço de venda</TableHead>
                <TableHead>Bateria (média)</TableHead>
                {isAdmin && <TableHead className="text-right">Custo total</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => {
                const isOpen = open.has(g.key);
                return (
                  <Fragment key={g.key}>
                    <TableRow className="cursor-pointer" onClick={() => toggle(g.key)} data-testid="summary-row">
                      <TableCell>
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-medium">
                        {g.brand !== "Apple" && <span className="text-muted-foreground">{g.brand} </span>}
                        {g.model}
                      </TableCell>
                      <TableCell>{formatCapacity(g.capacity)}</TableCell>
                      <TableCell>
                        <Badge variant={g.condition === "Lacrado" ? "available" : "secondary"}>{g.condition}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{g.qty}</TableCell>
                      <TableCell>
                        {g.minPrice == null
                          ? "—"
                          : g.minPrice === g.maxPrice
                            ? fmt(g.minPrice)
                            : `${fmt(g.minPrice)} – ${fmt(g.maxPrice!)}`}
                      </TableCell>
                      <TableCell>{g.avgBattery}%</TableCell>
                      {isAdmin && <TableCell className="text-right">{fmt(g.totalCost)}</TableCell>}
                    </TableRow>
                    {isOpen && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={cols} className="bg-muted/30 p-0">
                          <ul className="divide-y">
                            {g.devices.map((d) => (
                              <li key={d.id}>
                                <button
                                  type="button"
                                  onClick={() => onSelectDevice(d)}
                                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-12 py-2 text-left text-xs hover:bg-muted/60"
                                >
                                  <span className="font-medium text-foreground">{d.color || "—"}</span>
                                  <span className="font-mono text-muted-foreground">{d.serialImei || d.serial || d.internalSerial}</span>
                                  <span className="text-muted-foreground">Bateria {d.batteryHealth}%</span>
                                  <span className="text-muted-foreground">{d.location}</span>
                                  <span className="text-muted-foreground">{d.status}</span>
                                  <span className="ml-auto font-medium text-foreground">
                                    {d.salePrice != null ? fmt(d.salePrice) : "—"}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">
                    {loading ? "Carregando aparelhos…" : "Nenhum aparelho encontrado."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
