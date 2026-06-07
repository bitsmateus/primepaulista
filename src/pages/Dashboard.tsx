import { useState, useMemo } from "react";
import {
  ShoppingBag, TrendingUp, Wrench, Package, DollarSign, Percent,
  AlertTriangle, Clock,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useServiceOrderContext } from "@/contexts/ServiceOrderContext";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtShort = (v: number) =>
  v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(0)}`;
const COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff", "#ffd60a"];

type View = "vendas" | "os" | "estoque";
type Period = "today" | "7d" | "30d" | "month" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "month", label: "Mês" },
  { key: "all", label: "Tudo" },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Janela do período + janela anterior (para comparação)
function periodWindow(period: Period) {
  const now = new Date();
  const today = startOfDay(now);
  if (period === "all") return { start: new Date(0), prevStart: null, prevEnd: null };
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { start, prevStart, prevEnd: start };
  }
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const start = new Date(today.getTime() - (days - 1) * 86_400_000);
  const prevStart = new Date(start.getTime() - days * 86_400_000);
  return { start, prevStart, prevEnd: start };
}

const Money = ({ children }: { children: number }) => <>{fmt(children)}</>;

function Kpi({ label, value, hint, icon: Icon, tint, delta }: {
  label: string; value: string; hint?: string; icon: typeof DollarSign; tint: string; delta?: number | null;
}) {
  return (
    <Card className="border shadow-none">
      <CardContent className="flex items-start gap-4 p-5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
          <div className="flex items-center gap-2">
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            {delta != null && Number.isFinite(delta) && (
              <span className={`text-xs font-medium ${delta >= 0 ? "text-success" : "text-destructive"}`}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border shadow-none">
      <CardContent className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
        {children}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { sales, devices, lowStockAccessories } = useInventoryContext();
  const { orders } = useServiceOrderContext();

  const [view, setView] = useState<View>("vendas");
  const [period, setPeriod] = useState<Period>("30d");
  const [seller, setSeller] = useState<string>("all");

  const { start, prevStart, prevEnd } = useMemo(() => periodWindow(period), [period]);

  const sellers = useMemo(
    () => Array.from(new Set(sales.map((s) => s.seller).filter(Boolean))).sort(),
    [sales]
  );
  const deviceById = useMemo(
    () => Object.fromEntries(devices.map((d) => [d.id, d])),
    [devices]
  );

  const inSeller = (s: { seller: string }) => seller === "all" || s.seller === seller;
  const periodSales = useMemo(
    () => sales.filter((s) => new Date(s.createdAt) >= start && inSeller(s)),
    [sales, start, seller]
  );

  // ===================== VENDAS =====================
  const vendas = useMemo(() => {
    const revenue = periodSales.reduce((a, s) => a + s.total, 0);
    const count = periodSales.length;
    const avg = count ? revenue / count : 0;

    // lucro estimado (preço de venda do item - custo do aparelho)
    let profit = 0;
    for (const s of periodSales)
      for (const it of s.items) {
        if (it.type === "device") {
          const dev = it.deviceId ? deviceById[it.deviceId] : undefined;
          profit += it.price * it.quantity - (dev?.cost ?? 0) * it.quantity;
        } else {
          profit += it.price * it.quantity * 0.5; // margem estimada acessório
        }
      }

    // comparação período anterior
    let delta: number | null = null;
    if (prevStart && prevEnd) {
      const prevRev = sales
        .filter((s) => inSeller(s) && new Date(s.createdAt) >= prevStart && new Date(s.createdAt) < prevEnd)
        .reduce((a, s) => a + s.total, 0);
      delta = prevRev > 0 ? ((revenue - prevRev) / prevRev) * 100 : null;
    }

    // faturamento por dia (últimos 30 dias)
    const days: { dia: string; valor: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(startOfDay(new Date()).getTime() - i * 86_400_000);
      const next = new Date(d.getTime() + 86_400_000);
      const valor = sales
        .filter((s) => inSeller(s) && new Date(s.createdAt) >= d && new Date(s.createdAt) < next)
        .reduce((a, s) => a + s.total, 0);
      days.push({ dia: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), valor });
    }

    // por forma de pagamento
    const payMap: Record<string, number> = {};
    for (const s of periodSales) for (const p of s.payments) payMap[p.method] = (payMap[p.method] || 0) + p.amount;
    const byPayment = Object.entries(payMap).map(([name, value]) => ({ name, value }));

    // por vendedor
    const sellerMap: Record<string, number> = {};
    for (const s of periodSales) sellerMap[s.seller] = (sellerMap[s.seller] || 0) + s.total;
    const bySeller = Object.entries(sellerMap).map(([name, valor]) => ({ name, valor })).sort((a, b) => b.valor - a.valor);

    // por categoria
    const catMap: Record<string, number> = {};
    for (const s of periodSales)
      for (const it of s.items) {
        const cat = it.type === "device"
          ? (it.deviceId ? deviceById[it.deviceId]?.category || "Outro" : "Outro")
          : "Acessório";
        catMap[cat] = (catMap[cat] || 0) + it.price * it.quantity;
      }
    const byCategory = Object.entries(catMap).map(([name, value]) => ({ name, value }));

    // top modelos
    const modelMap: Record<string, number> = {};
    for (const s of periodSales)
      for (const it of s.items) if (it.type === "device") modelMap[it.name] = (modelMap[it.name] || 0) + it.quantity;
    const topModels = Object.entries(modelMap).map(([name, qtd]) => ({ name, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 6);

    // taxa de attach (vendas com acessório)
    const withAccessory = periodSales.filter((s) => s.items.some((i) => i.type === "accessory")).length;
    const attachRate = count ? (withAccessory / count) * 100 : 0;

    return { revenue, count, avg, profit, delta, days, byPayment, bySeller, byCategory, topModels, attachRate };
  }, [periodSales, sales, deviceById, prevStart, prevEnd, seller]);

  // ===================== OS =====================
  const os = useMemo(() => {
    const open = orders.filter((o) => o.status !== "Entregue / Finalizado");
    const overdue = open.filter((o) => (Date.now() - new Date(o.createdAt).getTime()) / 86_400_000 > 3);
    const completedPeriod = orders.filter(
      (o) => o.status === "Entregue / Finalizado" && o.completedAt && new Date(o.completedAt) >= start
    );
    const servRevenue = completedPeriod.reduce((a, o) => a + o.chargedAmount, 0);
    const servProfit = completedPeriod.reduce((a, o) => a + (o.chargedAmount - o.partCost - o.taxes), 0);

    const statuses = ["Aguardando Diagnóstico", "Aguardando Peça", "Em Reparo", "Pronto para Retirada", "Entregue / Finalizado"];
    const byStatus = statuses.map((st) => ({ name: st.replace("Aguardando ", "Ag. "), qtd: orders.filter((o) => o.status === st).length }));
    const prMap: Record<string, number> = {};
    for (const o of open) prMap[o.priority] = (prMap[o.priority] || 0) + 1;
    const byPriority = Object.entries(prMap).map(([name, value]) => ({ name, value }));

    return { openCount: open.length, overdue: overdue.length, completedCount: completedPeriod.length, servRevenue, servProfit, byStatus, byPriority, recent: orders.slice(0, 8) };
  }, [orders, start]);

  // ===================== ESTOQUE =====================
  const estoque = useMemo(() => {
    const inStock = devices.filter((d) => d.status === "Disponível" || d.status === "Reservado");
    const stockValue = inStock.reduce((a, d) => a + (d.cost || 0), 0);
    const potentialMargin = inStock.reduce((a, d) => a + (d.salePrice != null ? d.salePrice - d.cost : 0), 0);
    const stale = inStock
      .map((d) => ({ ...d, dias: Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 86_400_000) }))
      .filter((d) => d.dias > 30)
      .sort((a, b) => b.dias - a.dias);

    const catMap: Record<string, { qtd: number; valor: number }> = {};
    for (const d of inStock) {
      const c = d.category || "iPhone";
      catMap[c] = catMap[c] || { qtd: 0, valor: 0 };
      catMap[c].qtd += 1;
      catMap[c].valor += d.cost || 0;
    }
    const byCategory = Object.entries(catMap).map(([name, v]) => ({ name, qtd: v.qtd, valor: v.valor }));
    const statusMap: Record<string, number> = {};
    for (const d of devices) statusMap[d.status] = (statusMap[d.status] || 0) + 1;
    const byStatus = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

    return { inStockCount: inStock.length, stockValue, potentialMargin, staleCount: stale.length, stale: stale.slice(0, 8), byCategory, byStatus };
  }, [devices]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Visão geral da operação</p>
        </div>

        {/* Barra de visões + filtros */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border bg-muted/40 p-1">
            {([
              { key: "vendas", label: "Vendas", icon: ShoppingBag },
              { key: "os", label: "Assistência", icon: Wrench },
              { key: "estoque", label: "Estoque", icon: Package },
            ] as const).map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  view === v.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <v.icon className="h-4 w-4" /> {v.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    period === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {view === "vendas" && (
              <Select value={seller} onValueChange={setSeller}>
                <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos vendedores</SelectItem>
                  {sellers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* ===================== VENDAS ===================== */}
        {view === "vendas" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Faturamento" value={fmt(vendas.revenue)} icon={TrendingUp} tint="bg-success/10 text-success" delta={vendas.delta} />
              <Kpi label="Vendas" value={`${vendas.count}`} icon={ShoppingBag} tint="bg-primary/10 text-primary" />
              <Kpi label="Ticket médio" value={fmt(vendas.avg)} icon={DollarSign} tint="bg-blue-500/10 text-blue-600" />
              <Kpi label="Lucro estimado" value={fmt(vendas.profit)} hint={`Attach ${vendas.attachRate.toFixed(0)}%`} icon={Percent} tint="bg-emerald-500/10 text-emerald-600" />
            </div>

            <ChartCard title="Faturamento por dia (últimos 30 dias)">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={vendas.days}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dia" fontSize={11} interval={4} />
                  <YAxis fontSize={11} tickFormatter={fmtShort} width={50} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="valor" stroke="#0a84ff" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Vendas por vendedor">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={vendas.bySeller} layout="vertical">
                    <XAxis type="number" tickFormatter={fmtShort} fontSize={11} />
                    <YAxis type="category" dataKey="name" width={70} fontSize={11} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="valor" fill="#0a84ff" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Forma de pagamento">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={vendas.byPayment} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {vendas.byPayment.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Vendas por categoria">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={vendas.byCategory}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={fmtShort} width={50} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="value" fill="#30d158" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Produtos mais vendidos">
                {vendas.topModels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem vendas no período.</p>
                ) : (
                  <div className="space-y-2">
                    {vendas.topModels.map((m, i) => (
                      <div key={m.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-xs font-medium">{i + 1}</span>
                          {m.name}
                        </span>
                        <Badge variant="secondary">{m.qtd}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </ChartCard>
            </div>
          </div>
        )}

        {/* ===================== OS ===================== */}
        {view === "os" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="OS abertas" value={`${os.openCount}`} icon={Wrench} tint="bg-primary/10 text-primary" />
              <Kpi label="Atrasadas (>3 dias)" value={`${os.overdue}`} icon={AlertTriangle} tint="bg-destructive/10 text-destructive" />
              <Kpi label="Faturamento serviços" value={fmt(os.servRevenue)} hint={`${os.completedCount} concluídas`} icon={DollarSign} tint="bg-success/10 text-success" />
              <Kpi label="Lucro serviços" value={fmt(os.servProfit)} icon={Percent} tint="bg-emerald-500/10 text-emerald-600" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="OS por status">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={os.byStatus} layout="vertical">
                    <XAxis type="number" fontSize={11} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={110} fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="qtd" fill="#0a84ff" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="OS abertas por prioridade">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={os.byPriority} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {os.byPriority.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Ordens de serviço recentes">
              {os.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma OS.</p>
              ) : (
                <div className="space-y-2">
                  {os.recent.map((o) => (
                    <div key={o.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                      <div>
                        <p className="font-medium">{o.customerName} · {o.model}</p>
                        <p className="text-xs text-muted-foreground">{o.reportedIssue}</p>
                      </div>
                      <Badge variant="outline">{o.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>
          </div>
        )}

        {/* ===================== ESTOQUE ===================== */}
        {view === "estoque" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Aparelhos em loja" value={`${estoque.inStockCount}`} icon={Package} tint="bg-primary/10 text-primary" />
              <Kpi label="Capital investido" value={fmt(estoque.stockValue)} icon={DollarSign} tint="bg-emerald-500/10 text-emerald-600" />
              <Kpi label="Margem potencial" value={fmt(estoque.potentialMargin)} icon={TrendingUp} tint="bg-success/10 text-success" />
              <Kpi label="Parados >30 dias" value={`${estoque.staleCount}`} icon={Clock} tint="bg-warning/10 text-warning" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Estoque por categoria (qtd)">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={estoque.byCategory}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} allowDecimals={false} width={30} />
                    <Tooltip />
                    <Bar dataKey="qtd" fill="#0a84ff" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Aparelhos por status">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={estoque.byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {estoque.byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Aparelhos encalhados (mais de 30 dias parados)">
              {estoque.stale.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum aparelho parado há mais de 30 dias. 🎉</p>
              ) : (
                <div className="space-y-2">
                  {estoque.stale.map((d) => (
                    <div key={d.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                      <span>{d.category} · {d.model} {d.capacity} {d.color}</span>
                      <Badge variant="lowStock">{d.dias} dias</Badge>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>

            {lowStockAccessories.length > 0 && (
              <ChartCard title="Acessórios com estoque baixo">
                <div className="space-y-2">
                  {lowStockAccessories.map((a) => (
                    <div key={a.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                      <span>{a.name}</span>
                      <Badge variant={a.quantity === 0 ? "destructive" : "lowStock"}>
                        {a.quantity === 0 ? "Sem estoque" : `${a.quantity}/${a.minQuantity}`}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ChartCard>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
