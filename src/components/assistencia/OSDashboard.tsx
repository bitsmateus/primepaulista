import { Wrench, DollarSign, AlertTriangle, PackageCheck, Receipt, Timer, Zap, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { useServiceOrderContext } from "@/contexts/ServiceOrderContext";
import { buildOSReport, daysInLab, osProfit, FINALIZED } from "@/lib/serviceOrders";

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PRIORITY_COLORS: Record<string, string> = { Normal: "#8e8e93", Urgente: "#ff9500", "Crítico": "#ff3b30" };
const STATUS_COLOR = "#0a84ff";

function Kpi({ icon: Icon, tint, label, value }: { icon: typeof Wrench; tint: string; label: string; value: string | number }) {
  return (
    <Card className="border shadow-none">
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold text-foreground truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OSDashboard() {
  const { orders } = useServiceOrderContext();
  const now = new Date();
  const r = buildOSReport(orders, now);

  const statusData = r.byStatus.filter((s) => s.count > 0).map((s) => ({ name: s.status, value: s.count }));
  const priorityData = r.byPriority.filter((p) => p.count > 0).map((p) => ({ name: p.priority, value: p.count }));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Wrench} tint="bg-primary/10 text-primary" label="OS abertas" value={r.open} />
        <Kpi icon={PackageCheck} tint="bg-success/10 text-success" label="Prontas p/ retirada" value={r.ready} />
        <Kpi icon={DollarSign} tint="bg-success/10 text-success" label="Lucro no mês" value={money(r.monthProfit)} />
        <Kpi icon={Receipt} tint="bg-primary/10 text-primary" label="Faturamento no mês" value={money(r.monthRevenue)} />
        <Kpi icon={TrendingUp} tint="bg-primary/10 text-primary" label="Ticket médio (mês)" value={money(r.avgTicket)} />
        <Kpi icon={Timer} tint="bg-muted text-muted-foreground" label="Tempo médio no lab" value={`${r.avgDaysOpen.toFixed(1)}d`} />
        <Kpi icon={AlertTriangle} tint="bg-destructive/10 text-destructive" label="Pendentes +3 dias" value={r.overdue} />
        <Kpi icon={Zap} tint="bg-warning/10 text-warning" label="Urgentes/críticas" value={r.urgent} />
      </div>

      {/* Distribuições */}
      {orders.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border shadow-none">
            <CardContent className="p-6">
              <h2 className="mb-4 text-base font-semibold text-foreground">OS por status</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={statusData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis type="category" dataKey="name" width={130} fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="value" fill={STATUS_COLOR} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border shadow-none">
            <CardContent className="p-6">
              <h2 className="mb-4 text-base font-semibold text-foreground">OS por prioridade</h2>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {priorityData.map((p) => <Cell key={p.name} fill={PRIORITY_COLORS[p.name] ?? "#8e8e93"} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Últimas OS */}
      {orders.length > 0 ? (
        <Card className="border shadow-none">
          <CardContent className="p-6">
            <h2 className="mb-4 text-base font-semibold text-foreground">Últimas Ordens de Serviço</h2>
            <div className="space-y-3">
              {orders.slice(0, 10).map((o) => {
                const days = daysInLab(o, now);
                return (
                  <div key={o.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{o.customerName} — {o.model}</p>
                      <p className="text-xs text-muted-foreground truncate">{o.reportedIssue}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">{money(osProfit(o))}</span>
                      <span className="text-xs text-muted-foreground">{days}d</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        o.status === "Pronto para Retirada" ? "bg-success/10 text-success"
                          : o.status === FINALIZED ? "bg-muted text-muted-foreground"
                          : days > 3 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                      }`}>{o.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border shadow-none">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma ordem de serviço ainda. Crie a primeira no Painel de OS.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
