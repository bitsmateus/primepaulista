import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Eye, FileText, MessageCircle, Pencil, Plus, Printer, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { QuoteFormDialog } from "@/components/quotes/QuoteFormDialog";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuotes } from "@/hooks/useQuotes";
import { Quote, QuoteDisplayStatus, QuoteStatus } from "@/types/quote";
import {
  buildQuoteSummary, canConvertQuote, quoteDisplayStatus, quoteItemsSummary, quoteMatchesSearch,
  quoteWhatsappText, whatsappLink,
} from "@/lib/quotes";
import { printQuote } from "@/utils/quotePrint";
import { STORE } from "@/utils/receiptGenerator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d?: Date) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "Aberto", label: "Abertos" },
  { value: "Enviado", label: "Enviados" },
  { value: "Aprovado", label: "Aprovados" },
  { value: "Convertido", label: "Convertidos em venda" },
  { value: "Recusado", label: "Recusados" },
  { value: "Expirado", label: "Expirados" },
];
const PERIODS = [
  { value: "all", label: "Todo o período" },
  { value: "today", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
];

const badgeVariant: Record<QuoteDisplayStatus, "outline" | "secondary" | "reserved" | "available" | "destructive" | "maintenance"> = {
  Aberto: "outline",
  Enviado: "secondary",
  Aprovado: "reserved",
  Convertido: "available",
  Recusado: "destructive",
  Expirado: "maintenance",
};

function inPeriod(date: Date, period: string, now: Date): boolean {
  if (period === "all") return true;
  if (period === "today") return new Date(date).toDateString() === now.toDateString();
  const days = period === "7d" ? 7 : 30;
  return (now.getTime() - new Date(date).getTime()) / 86_400_000 <= days;
}

export default function OrcamentosPage() {
  const { devices, accessories, customers } = useInventoryContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const { quotes, isLoading, createQuote, updateQuote, setStatus, deleteQuote } = useQuotes();

  const [search, setSearch] = useState("");
  const [status, setStatus_] = useState("all");
  const [period, setPeriod] = useState("all");
  const [sellerFilter, setSellerFilter] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [template, setTemplate] = useState<Quote | null>(null);
  const [viewing, setViewing] = useState<Quote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null);

  const now = new Date();
  const sellers = useMemo(() => [...new Set(quotes.map((q) => q.sellerName).filter(Boolean))].sort(), [quotes]);
  const sellerOptions = useMemo(() => {
    const set = new Set<string>(["Gabriel", "Matheus", "Tassio", ...sellers]);
    if (user?.name) set.add(user.name);
    return [...set].sort();
  }, [sellers, user]);

  const filtered = useMemo(
    () =>
      quotes.filter((q) => {
        if (!quoteMatchesSearch(q, search)) return false;
        if (status !== "all" && quoteDisplayStatus(q, now) !== status) return false;
        if (sellerFilter !== "all" && q.sellerName !== sellerFilter) return false;
        if (!inPeriod(q.createdAt, period, now)) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quotes, search, status, sellerFilter, period]
  );
  const summary = buildQuoteSummary(filtered, now);

  const openNew = () => { setEditing(null); setTemplate(null); setFormOpen(true); };
  const openEdit = (q: Quote) => { setEditing(q); setTemplate(null); setFormOpen(true); };
  const openDuplicate = (q: Quote) => { setEditing(null); setTemplate(q); setFormOpen(true); };

  const sendWhatsapp = async (q: Quote) => {
    if (!q.customerPhone.trim()) {
      toast.error("Este orçamento não tem WhatsApp do cliente. Edite e informe o telefone.");
      return;
    }
    window.open(whatsappLink(q.customerPhone, quoteWhatsappText(q, STORE.name)), "_blank", "noopener");
    if (q.status === "Aberto") {
      try { await setStatus(q.id, "Enviado"); } catch { /* o hook já avisa */ }
    }
  };

  const changeStatus = async (q: Quote, st: Exclude<QuoteStatus, "Convertido">) => {
    try {
      await setStatus(q.id, st);
      toast.success(`Orçamento nº ${q.number} marcado como ${st}.`);
    } catch { /* o hook já avisa */ }
  };

  const canDelete = (q: Quote) => q.status !== "Convertido" && (isAdmin || (!!q.sellerId && q.sellerId === user?.id));

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Orçamentos</h1>
            <p className="mt-1 text-sm text-muted-foreground">Propostas comerciais que viram venda com um clique</p>
          </div>
          <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Novo orçamento</Button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Em aberto", value: summary.openCount },
            { label: "Valor em aberto", value: fmt(summary.openValue) },
            { label: "Convertidos em venda", value: summary.convertedCount },
            { label: "Taxa de conversão", value: `${summary.conversionRate.toFixed(0)}%` },
          ].map((c) => (
            <Card key={c.label} className="border shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nº, cliente, telefone, produto..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus_}>
            <SelectTrigger className="w-48" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40" aria-label="Período"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sellerFilter} onValueChange={setSellerFilter}>
            <SelectTrigger className="w-40" aria-label="Vendedor"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos vendedores</SelectItem>
              {sellers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="ml-auto self-center">{filtered.length} orçamento(s)</Badge>
        </div>

        <Card className="border shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Válido até</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-56"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((q) => {
                    const st = quoteDisplayStatus(q, now);
                    return (
                      <TableRow key={q.id} data-testid="quote-row">
                        <TableCell className="font-mono text-xs">#{q.number}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(q.createdAt)}</TableCell>
                        <TableCell className="font-medium">{q.customerName}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={quoteItemsSummary(q)}>
                          {quoteItemsSummary(q)}
                        </TableCell>
                        <TableCell>{q.sellerName || "—"}</TableCell>
                        <TableCell className={st === "Expirado" ? "text-warning font-medium" : ""}>{fmtDate(q.validUntil)}</TableCell>
                        <TableCell className="font-semibold">{fmt(q.total)}</TableCell>
                        <TableCell>
                          {q.status === "Convertido" ? (
                            <Badge variant={badgeVariant[st]}>{st}</Badge>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="cursor-pointer" title="Mudar status" aria-label={`Status do orçamento ${q.number}`}>
                                  <Badge variant={badgeVariant[st]}>{st}</Badge>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {(["Aberto", "Enviado", "Aprovado", "Recusado"] as const).map((s) => (
                                  <DropdownMenuItem key={s} disabled={q.status === s} onClick={() => changeStatus(q, s)}>{s}</DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex">
                            <Button variant="ghost" size="icon" title="Ver detalhes" onClick={() => setViewing(q)}><Eye className="h-4 w-4 text-muted-foreground" /></Button>
                            {q.status !== "Convertido" && (
                              <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(q)}><Pencil className="h-4 w-4 text-muted-foreground" /></Button>
                            )}
                            <Button variant="ghost" size="icon" title="Imprimir / PDF" onClick={() => printQuote(q)}><Printer className="h-4 w-4 text-muted-foreground" /></Button>
                            <Button variant="ghost" size="icon" title="Enviar por WhatsApp" onClick={() => sendWhatsapp(q)}><MessageCircle className="h-4 w-4 text-muted-foreground" /></Button>
                            <Button variant="ghost" size="icon" title="Duplicar" onClick={() => openDuplicate(q)}><Copy className="h-4 w-4 text-muted-foreground" /></Button>
                            {canConvertQuote(q) && (
                              <Button variant="ghost" size="icon" title="Converter em venda" onClick={() => navigate(`/pdv?orcamento=${q.id}`)}>
                                <ShoppingCart className="h-4 w-4 text-primary" />
                              </Button>
                            )}
                            {canDelete(q) && (
                              <Button variant="ghost" size="icon" title="Excluir" onClick={() => setDeleteTarget(q)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                        {isLoading ? "Carregando orçamentos…" : (
                          <div className="flex flex-col items-center gap-2">
                            <FileText className="h-6 w-6" />
                            {quotes.length === 0 ? "Nenhum orçamento ainda. Crie o primeiro." : "Nenhum orçamento encontrado com os filtros atuais."}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <QuoteFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        quote={editing}
        template={template}
        devices={devices}
        accessories={accessories}
        customers={customers}
        sellerOptions={sellerOptions}
        defaultSeller={user?.name ?? ""}
        onSubmit={async (input) => {
          if (editing) {
            await updateQuote(editing.id, input);
            toast.success(`Orçamento nº ${editing.number} atualizado.`);
          } else {
            const q = await createQuote(input);
            toast.success(`Orçamento nº ${q.number} criado.`);
          }
        }}
      />

      {/* Detalhes */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Orçamento nº {viewing?.number}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{viewing.customerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {viewing.customerPhone || "sem telefone"} · {viewing.sellerName} · criado em {fmtDate(viewing.createdAt)}
                  </p>
                </div>
                <Badge variant={badgeVariant[quoteDisplayStatus(viewing)]}>{quoteDisplayStatus(viewing)}</Badge>
              </div>
              <div className="divide-y rounded-lg border">
                {viewing.items.map((i) => (
                  <div key={i.id} className="flex items-center justify-between px-3 py-2">
                    <span>{i.quantity}× {i.name}</span>
                    <span className="text-muted-foreground">{fmt(i.price * i.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {viewing.discount > 0 && (
                  <div className="flex justify-between text-muted-foreground"><span>Desconto</span><span>− {fmt(viewing.discount)}</span></div>
                )}
                <div className="flex justify-between font-semibold"><span>Total</span><span>{fmt(viewing.total)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs text-muted-foreground">Válido até</Label><p>{fmtDate(viewing.validUntil)}</p></div>
                <div><Label className="text-xs text-muted-foreground">Pagamento</Label><p>{viewing.paymentTerms || "—"}</p></div>
              </div>
              {viewing.notes && (
                <div><Label className="text-xs text-muted-foreground">Observações</Label><p className="whitespace-pre-wrap">{viewing.notes}</p></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && <>O orçamento nº <strong>{deleteTarget.number}</strong> de <strong>{deleteTarget.customerName}</strong> será excluído. Esta ação não pode ser desfeita.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const target = deleteTarget;
                setDeleteTarget(null);
                if (!target) return;
                try { await deleteQuote(target.id); toast.success("Orçamento excluído."); } catch { /* o hook já avisa */ }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
