import { TrendingUp, TrendingDown, DollarSign, Wrench, AlertTriangle, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ResponsiveContainer } from "recharts";

interface Props {
  financial: any;
}

export function OverviewTab({ financial }: Props) {
  const {
    grossRevenue, netProfit, prevNetProfit,
    deviceCosts, partCosts, cardTaxes, totalCommissions, totalExpenses,
    revenueTrend, monthlyComparison,
    openOSCount, osServiceProfit, pendingOver3Days,
  } = financial;

  const profitChange = prevNetProfit !== 0
    ? ((netProfit - prevNetProfit) / Math.abs(prevNetProfit)) * 100
    : 0;
  const isUp = profitChange >= 0;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Faturamento Bruto</p>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{fmt(grossRevenue)}</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-primary/20 shadow-none bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Lucro Líquido</p>
              {isUp ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{fmt(netProfit)}</p>
            <p className={`mt-1 text-xs font-medium ${isUp ? "text-success" : "text-destructive"}`}>
              {isUp ? "+" : ""}{profitChange.toFixed(1)}% vs mês anterior
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">OS Abertas</p>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{openOSCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Lucro serviços: {fmt(osServiceProfit)}</p>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Pendentes +3 dias</p>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{pendingOver3Days}</p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown */}
      <Card className="border shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composição de Custos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Custo Aparelhos", value: deviceCosts },
              { label: "Custo Peças", value: partCosts },
              { label: "Taxa Cartão", value: cardTaxes },
              { label: "Comissões", value: totalCommissions },
              { label: "Despesas Fixas", value: totalExpenses },
            ].map(item => (
              <div key={item.label} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{fmt(item.value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Receita nos Últimos 7 Dias</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ revenue: { label: "Receita", color: "hsl(var(--primary))" } }} className="h-[250px]">
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Comparativo Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{
              faturamento: { label: "Faturamento", color: "hsl(var(--primary))" },
              lucro: { label: "Lucro", color: "hsl(var(--success))" },
            }} className="h-[250px]">
              <BarChart data={monthlyComparison}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="faturamento" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lucro" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
