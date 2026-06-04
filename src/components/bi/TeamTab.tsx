import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Trophy } from "lucide-react";

interface Props {
  financial: any;
}

export function TeamTab({ financial }: Props) {
  const { sellerPerformance, commissionConfigs, updateCommission } = financial;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-6">
      {/* Ranking */}
      <div className="grid gap-4 sm:grid-cols-3">
        {sellerPerformance.map((sp: any, i: number) => (
          <Card key={sp.seller} className={`border shadow-none ${i === 0 ? "border-2 border-warning/40 bg-warning/5" : ""}`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{medals[i] || ""}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{sp.seller}</p>
                  <p className="text-xs text-muted-foreground">{sp.salesCount} vendas</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Receita</span>
                  <span className="font-medium text-foreground">{fmt(sp.totalRevenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ticket Médio</span>
                  <span className="font-medium text-foreground">{fmt(sp.avgTicket)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxa Acessórios</span>
                  <Badge variant="secondary">{sp.accessoryRate.toFixed(0)}%</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Comissão</span>
                  <span className="font-semibold text-success">{fmt(sp.commission)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue chart */}
      <Card className="border shadow-none">
        <CardHeader className="pb-2"><CardTitle className="text-base">Receita por Vendedor</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={{
            totalRevenue: { label: "Receita", color: "hsl(var(--primary))" },
            commission: { label: "Comissão", color: "hsl(var(--warning))" },
          }} className="h-[250px]">
            <BarChart data={sellerPerformance}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="seller" className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="totalRevenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="commission" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Commission config */}
      <Card className="border shadow-none">
        <CardHeader className="pb-2"><CardTitle className="text-base">Configuração de Comissões</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {commissionConfigs.map((cfg: any) => (
              <div key={cfg.seller} className="flex items-center gap-6 rounded-lg border px-4 py-3">
                <p className="w-24 text-sm font-medium text-foreground">{cfg.seller}</p>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Aparelho %</Label>
                  <Input type="number" className="w-20 h-8" value={cfg.devicePercent} onChange={e => updateCommission(cfg.seller, "devicePercent", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Acessório %</Label>
                  <Input type="number" className="w-20 h-8" value={cfg.accessoryPercent} onChange={e => updateCommission(cfg.seller, "accessoryPercent", parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
