import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useAiMetrics } from "@/hooks/useAI";
import { AI_KIND_LABELS, pct } from "@/lib/aiLabels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Stat = ({ label, value, sub, id }: { label: string; value: string; sub?: string; id: string }) => (
  <Card className="border shadow-none" data-testid={`m-${id}`}>
    <CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums" data-testid={`m-${id}-value`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground" data-testid={`m-${id}-sub`}>{sub}</p>}
    </CardContent>
  </Card>
);

// "IA no atendimento": números dos últimos dias (o simulador não conta)
export function AiMetricsTab() {
  const [days, setDays] = useState(30);
  const { data: m, isLoading } = useAiMetrics(days);
  const dm = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

  return (
    <div className="space-y-4" data-testid="ai-metrics">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Período</span>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40" aria-label="Período das métricas"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">O simulador não conta aqui.</span>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando métricas…</p>}
      {m && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat id="questions" label="Perguntas atendidas pela IA" value={String(m.totals.questions)} sub={`${m.totals.tokens.toLocaleString("pt-BR")} tokens no período`} />
            <Stat id="auto" label="Enviadas automaticamente" value={pct(m.rates.auto)} sub={`${m.totals.auto} resposta(s)`} />
            <Stat id="reviewed" label="Revisadas (aprovadas ou editadas)" value={pct(m.rates.reviewed)} sub={`${m.totals.reviewed} · ${m.totals.agent} usada(s) pelo atendente na conversa`} />
            <Stat id="discarded" label="Descartadas" value={pct(m.rates.discarded)} sub={`${m.totals.discarded} resposta(s)`} />
            <Stat id="confidence" label="Confiança média" value={pct(m.avgConfidence)} />
            <Stat id="latency" label="Latência média" value={m.avgLatencyMs === null ? "—" : `${(m.avgLatencyMs / 1000).toFixed(1)} s`} />
            <Stat id="errors" label="Erros" value={String(m.totals.errors)} sub={pct(m.rates.errors) + " das perguntas"} />
            <Stat id="pending" label="Aguardando revisão agora" value={String(m.totals.pendingReviews)} />
          </div>
          <Card className="border shadow-none" data-testid="chart-ai-daily">
            <CardHeader className="pb-2"><CardTitle className="text-base">Perguntas por dia</CardTitle></CardHeader>
            <CardContent>
              {m.totals.questions === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Ainda sem perguntas no período</p>
              ) : (
                <ChartContainer
                  config={{ auto: { label: "Automáticas", color: "hsl(var(--success))" }, reviewed: { label: "Revisadas / usadas", color: "hsl(var(--primary))" }, discarded: { label: "Descartadas", color: "hsl(var(--muted-foreground))" }, errors: { label: "Erros", color: "hsl(var(--destructive))" } }}
                  className="h-[240px]"
                >
                  <BarChart data={m.daily.map((d) => ({ ...d, label: dm(d.date) }))}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="auto" stackId="a" fill="var(--color-auto)" />
                    <Bar dataKey="reviewed" stackId="a" fill="var(--color-reviewed)" />
                    <Bar dataKey="discarded" stackId="a" fill="var(--color-discarded)" />
                    <Bar dataKey="errors" stackId="a" fill="var(--color-errors)" />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
          {m.byKind.length > 0 && (
            <Card className="border shadow-none" data-testid="ai-by-kind">
              <CardHeader className="pb-2"><CardTitle className="text-base">Por tipo de atendimento</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-4 text-sm">
                {m.byKind.map((k) => <span key={k.kind}>{AI_KIND_LABELS[k.kind] ?? k.kind}: <strong>{k.total}</strong></span>)}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
