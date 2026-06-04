import { DollarSign, Smartphone, AlertTriangle, ShoppingBag, TrendingUp, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useServiceOrderContext } from "@/contexts/ServiceOrderContext";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Dashboard() {
  const { totalInvested, devicesInStore, lowStockAccessories, sales } =
    useInventoryContext();
  const { openOrders } = useServiceOrderContext();

  const now = new Date();
  const sameDay = (d: Date) =>
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const sameMonth = (d: Date) =>
    d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();

  const salesToday = sales.filter((s) => sameDay(new Date(s.createdAt)));
  const salesMonth = sales.filter((s) => sameMonth(new Date(s.createdAt)));
  const revenueToday = salesToday.reduce((a, s) => a + s.total, 0);
  const revenueMonth = salesMonth.reduce((a, s) => a + s.total, 0);

  const cards = [
    {
      label: "Faturamento (mês)",
      value: fmt(revenueMonth),
      icon: TrendingUp,
      tint: "bg-success/10 text-success",
    },
    {
      label: "Vendas hoje",
      value: `${salesToday.length}`,
      hint: revenueToday > 0 ? fmt(revenueToday) : undefined,
      icon: ShoppingBag,
      tint: "bg-primary/10 text-primary",
    },
    {
      label: "Aparelhos em Loja",
      value: `${devicesInStore}`,
      icon: Smartphone,
      tint: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "Total Investido",
      value: fmt(totalInvested),
      icon: DollarSign,
      tint: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: "OS abertas",
      value: `${openOrders}`,
      icon: Wrench,
      tint: "bg-orange-500/10 text-orange-600",
    },
    {
      label: "Acessórios estoque baixo",
      value: `${lowStockAccessories.length}`,
      icon: AlertTriangle,
      tint: "bg-warning/10 text-warning",
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visão geral da operação
          </p>
        </div>

        {/* Metric cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Card key={c.label} className="border shadow-none">
              <CardContent className="flex items-start gap-4 p-6">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.tint}`}>
                  <c.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{c.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{c.value}</p>
                  {c.hint && <p className="text-xs text-muted-foreground">{c.hint}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
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
                      <p className="text-sm font-medium text-foreground">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.compatibleModel} · {a.subcategory}
                      </p>
                    </div>
                    <Badge variant={a.quantity === 0 ? "destructive" : "lowStock"}>
                      {a.quantity === 0 ? "Sem estoque" : `${a.quantity}/${a.minQuantity}`}
                    </Badge>
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
