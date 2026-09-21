import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, RotateCcw, Pencil, Download, FileSpreadsheet } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PAYMENT_METHODS } from "@/lib/payments";
import {
  AUDIT_STATUSES, AUDIT_STATUS_LABEL, EMPTY_SUMMARY, paymentLabel,
  type AuditStatus, type ReconciliationFilters, type ReconciliationRow,
} from "@/lib/reconciliation";
import { buildReconciliationReport } from "@/lib/reports/reconciliation";
import { exportReport } from "@/lib/reports/export";
import { fmtMoney } from "@/lib/reports/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PAGE_SIZE = 50;
const ALL = "all";

const STATUS_STYLE: Record<AuditStatus, string> = {
  Aguardando: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  Conferido: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  Divergente: "bg-red-100 text-red-800 hover:bg-red-100",
};

const fmtDt = (d: Date) => d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Aba "Conferência" do BI: conciliação de pagamentos (Aguardando / Conferido / Divergente)
export function ReconciliationTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [filters, setFilters] = useState<ReconciliationFilters>({});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allInFilter, setAllInFilter] = useState(false); // "selecionar todos do filtro"
  const [noteFor, setNoteFor] = useState<ReconciliationRow | null>(null);
  const [noteText, setNoteText] = useState("");
  const [confirm, setConfirm] = useState<AuditStatus | null>(null);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["reconciliation", filters, page],
    queryFn: () => api.listReconciliation(filters, { limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });
  const rows = useMemo(() => data?.payments ?? [], [data]);
  const total = data?.total ?? 0;
  const summary = data?.summary ?? EMPTY_SUMMARY;
  const sellers = data?.sellers ?? [];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // mudou o filtro: volta à 1ª página e limpa a seleção
  const setFilter = (patch: Partial<ReconciliationFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
    setSelected(new Set());
    setAllInFilter(false);
  };
  useEffect(() => {
    if (page > 0 && page >= pages) setPage(pages - 1);
  }, [page, pages]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["reconciliation"] });
    qc.invalidateQueries({ queryKey: ["reconciliationSummary"] });
    qc.invalidateQueries({ queryKey: ["sales"] });
  };
  const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Não foi possível salvar.");

  const oneMut = useMutation({
    mutationFn: (v: { id: string; status?: AuditStatus; note?: string }) => api.setPaymentAudit(v.id, { status: v.status, note: v.note }),
    onSuccess: (_r, v) => {
      refresh();
      toast.success(v.status ? (v.status === "Aguardando" ? "Conferência desfeita." : `Pagamento marcado como ${AUDIT_STATUS_LABEL[v.status]}.`) : "Observação salva.");
    },
    onError: fail,
  });
  const bulkMut = useMutation({
    mutationFn: (status: AuditStatus) =>
      api.bulkPaymentAudit(allInFilter ? { status, filter: filters } : { status, ids: [...selected] }),
    onSuccess: (r, status) => {
      refresh();
      setSelected(new Set());
      setAllInFilter(false);
      setConfirm(null);
      toast.success(`${r.updated} pagamento${r.updated === 1 ? "" : "s"} ${status === "Conferido" ? "conferido" : status === "Divergente" ? "marcado(s) como divergente" : "voltou(aram) a Aguardando"}${r.unchanged ? ` (${r.unchanged} já estava${r.unchanged === 1 ? "" : "m"} assim)` : ""}.`);
    },
    onError: (e) => {
      setConfirm(null);
      fail(e);
    },
  });

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectedCount = allInFilter ? total : selected.size;

  const toggleAllPage = (on: boolean) => {
    setAllInFilter(false);
    setSelected(on ? new Set(pageIds) : new Set());
  };
  const toggleOne = (id: string, on: boolean) => {
    setAllInFilter(false);
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const exportAs = async (format: "csv" | "xlsx") => {
    try {
      const all = await api.exportReconciliation(filters);
      const desc: string[] = [];
      if (filters.from || filters.to) desc.push(`Período: ${filters.from ?? "início"} a ${filters.to ?? "hoje"}`);
      if (filters.method) desc.push(`Forma: ${filters.method}`);
      if (filters.status) desc.push(`Status: ${AUDIT_STATUS_LABEL[filters.status]}`);
      if (filters.seller) desc.push(`Vendedor: ${filters.seller}`);
      if (filters.q) desc.push(`Busca: ${filters.q}`);
      await exportReport(buildReconciliationReport(all, desc, { canSeeCost: false }), format, user?.name ?? "");
      toast.success(`${all.length} pagamentos exportados.`);
    } catch (e) {
      fail(e);
    }
  };

  const openNote = (r: ReconciliationRow) => {
    setNoteFor(r);
    setNoteText(r.auditNote);
  };

  const statusCards: { key: AuditStatus | "total"; label: string; count: number; amount: number; cls: string }[] = [
    { key: "total", label: "Total", count: AUDIT_STATUSES.reduce((s, k) => s + summary[k].count, 0), amount: AUDIT_STATUSES.reduce((s, k) => s + summary[k].total, 0), cls: "" },
    { key: "Aguardando", label: "Aguardando", count: summary.Aguardando.count, amount: summary.Aguardando.total, cls: "text-amber-700" },
    { key: "Conferido", label: "Conferido", count: summary.Conferido.count, amount: summary.Conferido.total, cls: "text-emerald-700" },
    { key: "Divergente", label: "Divergente / Em análise", count: summary.Divergente.count, amount: summary.Divergente.total, cls: "text-red-700" },
  ];

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statusCards.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-label={`Filtrar por ${c.label}`}
            onClick={() => setFilter({ status: c.key === "total" ? "" : c.key })}
            className="text-left"
          >
            <Card className={`border shadow-none transition-colors hover:bg-muted/40 ${(filters.status || "") === (c.key === "total" ? "" : c.key) ? "ring-1 ring-foreground/30" : ""}`}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-2xl font-semibold ${c.cls}`} data-testid={`card-${c.key}-count`}>{c.count}</p>
                <p className="text-sm text-muted-foreground" data-testid={`card-${c.key}-amount`}>{fmtMoney(c.amount)}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <Card className="border shadow-none">
        <CardContent className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label htmlFor="rec-from" className="text-xs">De</Label>
            <Input id="rec-from" type="date" value={filters.from ?? ""} onChange={(e) => setFilter({ from: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="rec-to" className="text-xs">Até</Label>
            <Input id="rec-to" type="date" value={filters.to ?? ""} onChange={(e) => setFilter({ to: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Forma de pagamento</Label>
            <Select value={filters.method || ALL} onValueChange={(v) => setFilter({ method: v === ALL ? "" : v })}>
              <SelectTrigger aria-label="Filtrar forma de pagamento"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filters.status || ALL} onValueChange={(v) => setFilter({ status: v === ALL ? "" : (v as AuditStatus) })}>
              <SelectTrigger aria-label="Filtrar status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {AUDIT_STATUSES.map((s) => <SelectItem key={s} value={s}>{AUDIT_STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Vendedor</Label>
            <Select value={filters.seller || ALL} onValueChange={(v) => setFilter({ seller: v === ALL ? "" : v })}>
              <SelectTrigger aria-label="Filtrar vendedor"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {sellers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="rec-q" className="text-xs">Buscar</Label>
            <Input id="rec-q" placeholder="Cliente, código, NSU…" value={filters.q ?? ""} onChange={(e) => setFilter({ q: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {/* Ações em lote + exportação */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2" data-testid="bulk-bar">
          {selectedCount > 0 ? (
            <>
              <span className="text-sm font-medium" data-testid="selected-count">{selectedCount} selecionado{selectedCount === 1 ? "" : "s"}</span>
              <Button size="sm" onClick={() => (allInFilter ? setConfirm("Conferido") : bulkMut.mutate("Conferido"))} disabled={bulkMut.isPending}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Marcar como Conferido
              </Button>
              <Button size="sm" variant="outline" onClick={() => (allInFilter ? setConfirm("Divergente") : bulkMut.mutate("Divergente"))} disabled={bulkMut.isPending}>
                <AlertTriangle className="mr-1 h-4 w-4" /> Marcar como Divergente
              </Button>
              <Button size="sm" variant="ghost" onClick={() => (allInFilter ? setConfirm("Aguardando") : bulkMut.mutate("Aguardando"))} disabled={bulkMut.isPending}>
                <RotateCcw className="mr-1 h-4 w-4" /> Voltar a Aguardando
              </Button>
              {!allInFilter && allPageSelected && total > rows.length && (
                <Button size="sm" variant="link" onClick={() => setAllInFilter(true)}>
                  Selecionar todos os {total} do filtro
                </Button>
              )}
              {allInFilter && (
                <Button size="sm" variant="link" onClick={() => { setAllInFilter(false); setSelected(new Set()); }}>
                  Limpar seleção
                </Button>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Selecione pagamentos para conferir em lote.</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportAs("csv")}><Download className="mr-1 h-4 w-4" /> CSV</Button>
          <Button size="sm" variant="outline" onClick={() => exportAs("xlsx")}><FileSpreadsheet className="mr-1 h-4 w-4" /> Excel</Button>
        </div>
      </div>

      {/* Tabela */}
      <Card className="border shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox aria-label="Selecionar todos da página" checked={allPageSelected} onCheckedChange={(v) => toggleAllPage(v === true)} />
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Venda</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    {isError ? "Não foi possível carregar." : isFetching ? "Carregando…" : "Nenhum pagamento neste filtro."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} data-testid="rec-row" data-status={r.auditStatus}>
                  <TableCell>
                    <Checkbox aria-label={`Selecionar pagamento ${r.saleCode}`} checked={allInFilter || selected.has(r.id)} onCheckedChange={(v) => toggleOne(r.id, v === true)} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{fmtDt(r.createdAt)}</TableCell>
                  <TableCell className="text-sm">{r.customerName}</TableCell>
                  <TableCell className="font-mono text-xs">{r.saleCode}</TableCell>
                  <TableCell className="text-sm">{r.sellerName || "—"}</TableCell>
                  <TableCell className="text-sm">{paymentLabel(r.method, r.installments)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm font-medium">{fmtMoney(r.amount)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLE[r.auditStatus]} variant="secondary">{AUDIT_STATUS_LABEL[r.auditStatus]}</Badge>
                    {r.auditedAt && (
                      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{r.auditedByName} · {fmtDt(r.auditedAt)}</p>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                    <span className="line-clamp-2" title={r.auditNote}>{r.auditNote || "—"}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar observação (NSU / comprovante)" aria-label={`Editar observação de ${r.saleCode}`} onClick={() => openNote(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {r.auditStatus !== "Conferido" && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-700" title="Marcar como Conferido" aria-label={`Conferir ${r.saleCode}`} disabled={oneMut.isPending} onClick={() => oneMut.mutate({ id: r.id, status: "Conferido" })}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    {r.auditStatus !== "Divergente" && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-700" title="Marcar como Divergente" aria-label={`Divergente ${r.saleCode}`} disabled={oneMut.isPending} onClick={() => oneMut.mutate({ id: r.id, status: "Divergente" })}>
                        <AlertTriangle className="h-4 w-4" />
                      </Button>
                    )}
                    {r.auditStatus !== "Aguardando" && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Voltar a Aguardando (desfazer)" aria-label={`Desfazer ${r.saleCode}`} disabled={oneMut.isPending} onClick={() => oneMut.mutate({ id: r.id, status: "Aguardando" })}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} pagamento{total === 1 ? "" : "s"} · Página {Math.min(page + 1, pages)} de {pages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      </div>

      {/* Observação */}
      <Dialog open={!!noteFor} onOpenChange={(o) => !o && setNoteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Observação da conferência</DialogTitle>
            <DialogDescription>
              {noteFor && `${noteFor.customerName} · venda ${noteFor.saleCode} · ${fmtMoney(noteFor.amount)} (${paymentLabel(noteFor.method, noteFor.installments)})`}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="rec-note">NSU, autenticação bancária ou cópia do comprovante</Label>
            <Textarea id="rec-note" rows={4} maxLength={500} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            <p className="mt-1 text-right text-xs text-muted-foreground">{noteText.length}/500</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteFor(null)}>Cancelar</Button>
            <Button
              disabled={oneMut.isPending}
              onClick={() => {
                if (!noteFor) return;
                oneMut.mutate({ id: noteFor.id, note: noteText.trim() }, { onSuccess: () => setNoteFor(null) });
              }}
            >
              Salvar observação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação do lote "todos do filtro" */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar a todos os {total} pagamentos do filtro?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "Conferido" && "Todos os pagamentos deste filtro serão marcados como Conferidos, em seu nome."}
              {confirm === "Divergente" && "Todos os pagamentos deste filtro serão marcados como Divergentes."}
              {confirm === "Aguardando" && "A conferência de todos os pagamentos deste filtro será desfeita."}
              {" "}A ação fica registrada na Auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && bulkMut.mutate(confirm)}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
