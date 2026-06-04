import { Wrench, DollarSign, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useServiceOrderContext } from "@/contexts/ServiceOrderContext";

export default function OSDashboard() {
  const { openOrders, monthlyProfit, pendingOver3Days, orders } = useServiceOrderContext();

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="border shadow-none">
          <CardContent className="flex items-start gap-4 p-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">OS Abertas</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{openOrders}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardContent className="flex items-start gap-4 p-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
              <DollarSign className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Lucro no Mês (Serviços)</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{formatCurrency(monthlyProfit)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardContent className="flex items-start gap-4 p-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pendentes +3 dias</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{pendingOver3Days}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent orders */}
      {orders.length > 0 && (
        <Card className="border shadow-none">
          <CardContent className="p-6">
            <h2 className="mb-4 text-base font-semibold text-foreground">Últimas Ordens de Serviço</h2>
            <div className="space-y-3">
              {orders.slice(0, 10).map((o) => {
                const daysDiff = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={o.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{o.customerName} — {o.model}</p>
                      <p className="text-xs text-muted-foreground">{o.reportedIssue}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{daysDiff}d no lab</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        o.status === "Pronto para Retirada"
                          ? "bg-success/10 text-success"
                          : o.status === "Entregue / Finalizado"
                            ? "bg-muted text-muted-foreground"
                            : daysDiff > 3
                              ? "bg-destructive/10 text-destructive"
                              : "bg-primary/10 text-primary"
                      }`}>
                        {o.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
