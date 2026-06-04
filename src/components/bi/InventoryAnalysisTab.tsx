import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PackageX, AlertTriangle } from "lucide-react";

interface Props {
  financial: any;
}

export function InventoryAnalysisTab({ financial }: Props) {
  const { staleDevices, staleAccessories, totalStaleValue } = financial;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const getStaleBadge = (days: number) => {
    if (days > 90) return <Badge variant="destructive">+90 dias</Badge>;
    if (days > 60) return <Badge className="bg-warning text-warning-foreground">+60 dias</Badge>;
    return <Badge variant="secondary">+30 dias</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className="border-2 border-destructive/20 shadow-none bg-destructive/5">
        <CardContent className="flex items-center gap-4 p-6">
          <PackageX className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-sm text-muted-foreground">Capital Imobilizado (Estoque Parado)</p>
            <p className="text-2xl font-semibold text-foreground">{fmt(totalStaleValue)}</p>
            <p className="text-xs text-muted-foreground">{staleDevices.length} aparelhos · {staleAccessories.length} acessórios sem movimentação há +30 dias</p>
          </div>
        </CardContent>
      </Card>

      {/* Stale Devices */}
      <Card className="border shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Aparelhos Parados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {staleDevices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum aparelho parado há mais de 30 dias ✓</p>
          ) : (
            <div className="space-y-2">
              {staleDevices.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{d.model} · {d.color}</p>
                    <p className="text-xs text-muted-foreground">{d.capacity}GB · {d.condition}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-foreground">{fmt(d.cost)}</p>
                    {getStaleBadge(d.daysInStock)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stale Accessories */}
      <Card className="border shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Acessórios Parados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {staleAccessories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum acessório parado há mais de 30 dias ✓</p>
          ) : (
            <div className="space-y-2">
              {staleAccessories.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.quantity} un · {a.compatibleModel}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-foreground">{fmt(a.totalValue)}</p>
                    {getStaleBadge(a.daysInStock)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
