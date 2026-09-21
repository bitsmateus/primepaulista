import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Download, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useServiceOrderContext } from "@/contexts/ServiceOrderContext";
import { can } from "@/lib/permissions";
import { PAYMENT_METHODS } from "@/lib/payments";
import { allBrands, allLocations } from "@/lib/deviceView";
import { OS_ORIGINS, OS_STATUSES, COST_RESPONSIBILITIES } from "@/lib/serviceOrders";
import { AUDIT_STATUSES, AUDIT_STATUS_LABEL, type AuditStatus } from "@/lib/reconciliation";
import { visibleReports, type ExportFormat, type ReportId, type ReportResult } from "@/lib/reports";
import { exportReport } from "@/lib/reports/export";
import { formatCell, toTextTable } from "@/lib/reports/format";
import { buildStockReport, DEFAULT_STOCK_FILTERS, type StockFilters } from "@/lib/reports/stock";
import { buildSalesReport, DEFAULT_SALES_FILTERS, type SalesFilters } from "@/lib/reports/sales";
import { buildFinanceReport } from "@/lib/reports/finance";
import { buildOSReport, DEFAULT_OS_REPORT_FILTERS, type OSReportFilters } from "@/lib/reports/serviceOrders";
import { buildCustomerReport, DEFAULT_CUSTOMER_REPORT_FILTERS, type CustomerReportFilters } from "@/lib/reports/customers";
import { buildQuoteReport, DEFAULT_QUOTE_REPORT_FILTERS, type QuoteReportFilters } from "@/lib/reports/quotes";
import { buildWarrantyReport, DEFAULT_WARRANTY_REPORT_FILTERS, type WarrantyReportFilters } from "@/lib/reports/warranties";
import { buildReconciliationReport } from "@/lib/reports/reconciliation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE = 25;
const ALL = "__all__";
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s: string): Date | undefined => (s ? new Date(`${s}T12:00:00`) : undefined);
const monthStart = () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); };

// ---------- filtros ----------
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs">{label}</Label>
      {children}
    </div>
  );
}

function SelectField({ label, value, onChange, options, allLabel = "Todos" }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; allLabel?: string }) {
  return (
    <Field label={label}>
      <Select value={value === "" ? ALL : value} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}
const opts = (list: string[]) => list.map((v) => ({ value: v, label: v }));

function DateFields({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <>
      <Field label="De"><Input type="date" aria-label="Período de" value={from} onChange={(e) => onFrom(e.target.value)} /></Field>
      <Field label="Até"><Input type="date" aria-label="Período até" value={to} onChange={(e) => onTo(e.target.value)} /></Field>
    </>
  );
}

// ---------- página ----------
export default function ReportsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const canSeeCost = can(role, "viewCost");
  const available = useMemo(() => visibleReports(role), [role]);
  const [current, setCurrent] = useState<ReportId>(() => available[0]?.id ?? "estoque");
  const active = available.find((r) => r.id === current) ?? available[0];

  const { devices, accessories, sales, customers } = useInventoryContext();
  const { orders } = useServiceOrderContext();

  // ---- filtros por relatório (o estado de cada um fica guardado ao trocar de aba) ----
  const [fStock, setFStock] = useState<StockFilters>(DEFAULT_STOCK_FILTERS);
  const [fSales, setFSales] = useState<SalesFilters & { fromS: string; toS: string }>({ ...DEFAULT_SALES_FILTERS, fromS: monthStart(), toS: ymd(new Date()) });
  const [fFin, setFFin] = useState({ fromS: monthStart(), toS: ymd(new Date()) });
  const [fOS, setFOS] = useState<OSReportFilters & { fromS: string; toS: string }>({ ...DEFAULT_OS_REPORT_FILTERS, fromS: monthStart(), toS: ymd(new Date()) });
  const [fCust, setFCust] = useState<CustomerReportFilters>(DEFAULT_CUSTOMER_REPORT_FILTERS);
  const [fQuote, setFQuote] = useState<QuoteReportFilters & { fromS: string; toS: string }>({ ...DEFAULT_QUOTE_REPORT_FILTERS, fromS: monthStart(), toS: ymd(new Date()) });
  const [fWar, setFWar] = useState<WarrantyReportFilters>(DEFAULT_WARRANTY_REPORT_FILTERS);
  const [fRec, setFRec] = useState<{ from: string; to: string; method: string; status: AuditStatus | ""; seller: string }>({ from: monthStart(), to: ymd(new Date()), method: "", status: "", seller: "" });
  const [page, setPage] = useState(0);

  // ---- dados que só são buscados quando o relatório é aberto ----
  const isFin = active?.id === "financeiro";
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: api.listQuotes, enabled: active?.id === "orcamentos" });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: api.listExpenses, enabled: isFin });
  const { data: sangrias = [] } = useQuery({ queryKey: ["sangrias"], queryFn: api.listSangrias, enabled: isFin });
  const { data: payables = [] } = useQuery({ queryKey: ["payables"], queryFn: api.listPayables, enabled: isFin });
  const { data: receivables = [] } = useQuery({ queryKey: ["receivables"], queryFn: api.listReceivables, enabled: isFin });
  const recFilters = { from: fRec.from, to: fRec.to, method: fRec.method, status: fRec.status, seller: fRec.seller };
  const { data: recRows = [], isFetching: recLoading } = useQuery({
    queryKey: ["reportReconciliation", recFilters],
    queryFn: () => api.exportReconciliation(recFilters),
    enabled: active?.id === "conferencia",
  });

  const sellers = useMemo(() => [...new Set(sales.map((s) => s.seller).filter(Boolean))].sort(), [sales]);
  const quoteSellers = useMemo(() => [...new Set(quotes.map((q) => q.sellerName).filter(Boolean))].sort(), [quotes]);
  const categories = useMemo(() => [...new Set([...devices.map((d) => d.category), ...accessories.map((a) => a.category)].filter(Boolean))].sort(), [devices, accessories]);
  const leadOrigins = useMemo(() => [...new Set(customers.map((c) => c.leadOrigin).filter(Boolean))].sort(), [customers]);

  // ---- monta o relatório (PURO: src/lib/reports) ----
  const report: ReportResult | null = useMemo(() => {
    if (!active) return null;
    const o = { canSeeCost };
    switch (active.id) {
      case "estoque": return buildStockReport(devices, accessories, fStock, o);
      case "vendas": return buildSalesReport(sales, devices, accessories, { ...fSales, from: parseDay(fSales.fromS), to: parseDay(fSales.toS) }, o);
      case "financeiro": {
        const custName = new Map(customers.map((c) => [c.id, c.name]));
        return buildFinanceReport(
          { sales, devices, accessories, expenses, sangrias, payables, receivables: receivables.map((r) => ({ customerName: r.customerId ? custName.get(r.customerId) ?? "" : "", amount: r.amount, dueDate: r.dueDate, status: r.status })) },
          { from: parseDay(fFin.fromS), to: parseDay(fFin.toS) }, o
        );
      }
      case "os": return buildOSReport(orders, { ...fOS, from: parseDay(fOS.fromS), to: parseDay(fOS.toS) }, o);
      case "clientes": return buildCustomerReport(customers, sales, fCust, o);
      case "orcamentos": return buildQuoteReport(quotes, { ...fQuote, from: parseDay(fQuote.fromS), to: parseDay(fQuote.toS) }, o);
      case "garantias": return buildWarrantyReport(sales, fWar, o);
      case "conferencia": {
        const d: string[] = [];
        if (fRec.from || fRec.to) d.push(`Período: ${fRec.from || "início"} a ${fRec.to || "hoje"}`);
        if (fRec.method) d.push(`Forma: ${fRec.method}`);
        if (fRec.status) d.push(`Status: ${AUDIT_STATUS_LABEL[fRec.status]}`);
        if (fRec.seller) d.push(`Vendedor: ${fRec.seller}`);
        return buildReconciliationReport(recRows, d, o);
      }
    }
  }, [active, canSeeCost, devices, accessories, sales, customers, orders, quotes, expenses, sangrias, payables, receivables, recRows, fStock, fSales, fFin, fOS, fCust, fQuote, fWar, fRec]);

  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const doExport = async (format: ExportFormat) => {
    if (!report) return;
    setBusy(format);
    try {
      await exportReport(report, format, user?.name ?? "");
      toast.success(`Relatório exportado (${format === "xlsx" ? "Excel" : format.toUpperCase()}).`);
    } catch {
      toast.error("Não foi possível gerar o arquivo.");
    } finally {
      setBusy(null);
    }
  };

  if (!active || !report) {
    return (
      <AppLayout>
        <p className="text-sm text-muted-foreground">Você não tem acesso a nenhum relatório.</p>
      </AppLayout>
    );
  }

  const table = toTextTable(report);
  const pages = Math.max(1, Math.ceil(table.body.length / PAGE));
  const pageIdx = Math.min(page, pages - 1);
  const slice = table.body.slice(pageIdx * PAGE, pageIdx * PAGE + PAGE);
  const right = (i: number) => report.columns[i]?.align === "right";

  const filterForm = (() => {
    const set = <T,>(setter: (fn: (p: T) => T) => void) => (patch: Partial<T>) => { setter((p) => ({ ...p, ...patch })); setPage(0); };
    switch (active.id) {
      case "estoque": {
        const s = set<StockFilters>(setFStock);
        return (
          <>
            <SelectField label="Tipo" value={fStock.kind === "todos" ? "" : fStock.kind} onChange={(v) => s({ kind: (v || "todos") as StockFilters["kind"] })} allLabel="Aparelhos e acessórios" options={[{ value: "aparelhos", label: "Só aparelhos" }, { value: "acessorios", label: "Só acessórios" }]} />
            <SelectField label="Categoria" value={fStock.category} onChange={(v) => s({ category: v })} options={opts(categories)} allLabel="Todas" />
            <SelectField label="Marca" value={fStock.brand} onChange={(v) => s({ brand: v })} options={opts(allBrands(devices))} />
            <SelectField label="Condição" value={fStock.condition} onChange={(v) => s({ condition: v })} options={opts(["Lacrado", "Seminovo"])} allLabel="Todas" />
            <SelectField label="Local" value={fStock.location} onChange={(v) => s({ location: v })} options={opts(allLocations(devices))} />
            <SelectField label="Status" value={fStock.status === "estoque" ? "" : fStock.status} onChange={(v) => s({ status: v || "estoque" })} allLabel="Em estoque (sem vendidos)" options={[{ value: "todos", label: "Todos (inclui vendidos)" }, ...opts(["Disponível", "Reservado", "Em Manutenção", "Vendido", "Estoque baixo", "Sem estoque"])]} />
          </>
        );
      }
      case "vendas": {
        const s = set<typeof fSales>(setFSales);
        return (
          <>
            <DateFields from={fSales.fromS} to={fSales.toS} onFrom={(v) => s({ fromS: v })} onTo={(v) => s({ toS: v })} />
            <SelectField label="Vendedor" value={fSales.seller} onChange={(v) => s({ seller: v })} options={opts(sellers)} />
            <SelectField label="Forma de pagamento" value={fSales.method} onChange={(v) => s({ method: v })} options={opts(PAYMENT_METHODS)} allLabel="Todas" />
            <SelectField label="Origem" value={fSales.origin} onChange={(v) => s({ origin: v })} options={opts(["Balcão", "Orçamento"])} allLabel="Todas" />
            <SelectField label="Situação" value={fSales.status === "concluidas" ? "" : fSales.status} onChange={(v) => s({ status: (v || "concluidas") as SalesFilters["status"] })} allLabel="Concluídas" options={[{ value: "devolvidas", label: "Devolvidas" }, { value: "todas", label: "Todas" }]} />
          </>
        );
      }
      case "financeiro": {
        const s = set<typeof fFin>(setFFin);
        return <DateFields from={fFin.fromS} to={fFin.toS} onFrom={(v) => s({ fromS: v })} onTo={(v) => s({ toS: v })} />;
      }
      case "os": {
        const s = set<typeof fOS>(setFOS);
        return (
          <>
            <DateFields from={fOS.fromS} to={fOS.toS} onFrom={(v) => s({ fromS: v })} onTo={(v) => s({ toS: v })} />
            <SelectField label="Status da OS" value={fOS.status} onChange={(v) => s({ status: v })} options={opts(OS_STATUSES)} />
            <SelectField label="Quem paga" value={fOS.responsibility} onChange={(v) => s({ responsibility: v })} options={opts(COST_RESPONSIBILITIES)} />
            <SelectField label="Origem da OS" value={fOS.origin} onChange={(v) => s({ origin: v })} options={opts(OS_ORIGINS)} allLabel="Todas" />
          </>
        );
      }
      case "clientes": {
        const s = set<CustomerReportFilters>(setFCust);
        return (
          <>
            <SelectField label="Origem do cliente" value={fCust.origin} onChange={(v) => s({ origin: v })} options={opts(leadOrigins)} allLabel="Todas" />
            <SelectField label="Aniversariantes de" value={fCust.birthdayMonth ? String(fCust.birthdayMonth) : ""} onChange={(v) => s({ birthdayMonth: Number(v) || 0 })} allLabel="Todos os meses" options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
            <SelectField label="Compras" value={fCust.buyers === "todos" ? "" : fCust.buyers} onChange={(v) => s({ buyers: (v || "todos") as CustomerReportFilters["buyers"] })} allLabel="Todos" options={[{ value: "comCompras", label: "Já compraram" }, { value: "semCompras", label: "Nunca compraram" }]} />
          </>
        );
      }
      case "orcamentos": {
        const s = set<typeof fQuote>(setFQuote);
        return (
          <>
            <DateFields from={fQuote.fromS} to={fQuote.toS} onFrom={(v) => s({ fromS: v })} onTo={(v) => s({ toS: v })} />
            <SelectField label="Status do orçamento" value={fQuote.status} onChange={(v) => s({ status: v })} options={opts(["Aberto", "Enviado", "Aprovado", "Recusado", "Convertido", "Expirado"])} />
            <SelectField label="Vendedor" value={fQuote.seller} onChange={(v) => s({ seller: v })} options={opts(quoteSellers)} />
          </>
        );
      }
      case "garantias": {
        const s = set<WarrantyReportFilters>(setFWar);
        return (
          <>
            <SelectField label="Situação da garantia" value={fWar.mode === "vencendo" ? "" : fWar.mode} onChange={(v) => s({ mode: (v || "vencendo") as WarrantyReportFilters["mode"] })} allLabel="Vencendo em breve" options={[{ value: "vigentes", label: "Todas as vigentes" }, { value: "vencidas", label: "Já vencidas" }]} />
            {fWar.mode === "vencendo" && (
              <Field label="Vencendo em até (dias)">
                <Input type="number" min={0} max={730} aria-label="Dias para vencer" value={fWar.days} onChange={(e) => s({ days: Math.max(0, Number(e.target.value) || 0) })} />
              </Field>
            )}
          </>
        );
      }
      case "conferencia": {
        const s = set<typeof fRec>(setFRec);
        return (
          <>
            <DateFields from={fRec.from} to={fRec.to} onFrom={(v) => s({ from: v })} onTo={(v) => s({ to: v })} />
            <SelectField label="Status da conferência" value={fRec.status} onChange={(v) => s({ status: v as AuditStatus | "" })} options={AUDIT_STATUSES.map((a) => ({ value: a, label: AUDIT_STATUS_LABEL[a] }))} />
            <SelectField label="Forma de pagamento" value={fRec.method} onChange={(v) => s({ method: v })} options={opts(PAYMENT_METHODS)} allLabel="Todas" />
            <SelectField label="Vendedor" value={fRec.seller} onChange={(v) => s({ seller: v })} options={opts(sellers)} />
          </>
        );
      }
    }
  })();

  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Central de Relatórios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Escolha o relatório, ajuste os filtros e exporte em PDF, Excel ou CSV.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="tablist" aria-label="Relatórios">
          {available.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === active.id}
              data-testid={`report-${r.id}`}
              onClick={() => { setCurrent(r.id); setPage(0); }}
              className="text-left"
            >
              <Card className={`h-full border shadow-none transition-colors hover:bg-muted/40 ${r.id === active.id ? "ring-1 ring-foreground/40" : ""}`}>
                <CardContent className="p-3">
                  <p className="text-sm font-semibold">{r.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        <Card className="border shadow-none">
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" data-testid="report-filters">{filterForm}</div>
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button onClick={() => doExport("pdf")} disabled={!!busy} aria-label="Exportar PDF">
                {busy === "pdf" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />} PDF
              </Button>
              <Button variant="outline" onClick={() => doExport("xlsx")} disabled={!!busy} aria-label="Exportar Excel">
                {busy === "xlsx" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />} Excel
              </Button>
              <Button variant="outline" onClick={() => doExport("csv")} disabled={!!busy} aria-label="Exportar CSV">
                {busy === "csv" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} CSV
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">{report.filters.join(" · ")}</span>
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" data-testid="report-summary">
          {report.summary.map((s) => (
            <Card key={s.label} className="border shadow-none">
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="text-base font-semibold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Prévia */}
        <Card className="border shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table data-testid="report-table">
                <TableHeader>
                  <TableRow>
                    {table.head.map((h, i) => <TableHead key={h + i} className={right(i) ? "text-right" : ""}>{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slice.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={table.head.length} className="py-8 text-center text-sm text-muted-foreground">
                        {recLoading && active.id === "conferencia" ? "Carregando…" : "Nenhum registro com estes filtros."}
                      </TableCell>
                    </TableRow>
                  )}
                  {slice.map((row, ri) => (
                    <TableRow key={ri} data-testid="report-row">
                      {row.map((c, ci) => <TableCell key={ci} className={`text-xs ${right(ci) ? "whitespace-nowrap text-right" : ""}`}>{c}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
                {report.totals && (
                  <TableFooter>
                    <TableRow data-testid="report-totals">
                      {report.totals.map((c, ci) => <TableCell key={ci} className={`text-xs font-semibold ${right(ci) ? "whitespace-nowrap text-right" : ""}`}>{formatCell(c, report.columns[ci]?.format)}</TableCell>)}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
        </Card>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span data-testid="report-count">{table.body.length} linha{table.body.length === 1 ? "" : "s"} · Página {pageIdx + 1} de {pages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pageIdx === 0} onClick={() => setPage(pageIdx - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={pageIdx + 1 >= pages} onClick={() => setPage(pageIdx + 1)}>Próxima</Button>
          </div>
        </div>
        {!canSeeCost && <p className="text-xs text-muted-foreground">Custos e lucros não aparecem nos relatórios para o seu cargo.</p>}
      </div>
    </AppLayout>
  );
}
