import { DollarSign, Smartphone, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";

export default function Dashboard() {
  const { totalInvested, devicesInStore, lowStockAccessories } =
    useInventoryContext();

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visão geral do estoque
          </p>
        </div>

        {/* Metric cards */}
        <div className="grid gap-6 sm:grid-cols-3">
          <Card className="border shadow-none">
            <CardContent className="flex items-start gap-4 p-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Investido
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {totalInvested.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-none">
            <CardContent className="flex items-start gap-4 p-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Aparelhos em Loja
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {devicesInStore}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-none">
            <CardContent className="flex items-start gap-4 p-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Acessórios Estoque Baixo
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {lowStockAccessories.length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Low stock list */}
        {lowStockAccessories.length > 0 && (
          <Card className="border shadow-none">
            <CardContent className="p-6">
              <h2 className="mb-4 text-base font-semibold text-foreground">
                Acessórios com Estoque Baixo
              </h2>
              <div className="space-y-3">
                {lowStockAccessories.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {a.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.compatibleModel} · {a.subcategory}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={a.quantity === 0 ? "destructive" : "lowStock"}>
                        {a.quantity === 0
                          ? "Sem estoque"
                          : `${a.quantity}/${a.minQuantity}`}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
