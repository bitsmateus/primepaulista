import { useState, useMemo } from "react";
import { Search, Eye, Printer, Pencil, Undo2, FileText } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";
import { Sale, PaymentMethod } from "@/types/inventory";
import { printReceipt } from "@/utils/receiptGenerator";
import {
  saleMatchesSearch, saleItemsSummary, salePaymentLabel, buildSalesSummary, computeSaleTotal, saleFullValue,
  saleNumberLabel, saleDeviceLines, tradeInModelLine,
} from "@/lib/sales";
import { buildDeviceMap, buildAccessoryMap, saleNetProfit, saleDeviceSaleValue, INVOICE_COST_RATE } from "@/lib/profit";
import { isReturned, canReturn } from "@/lib/returns";
import { PAYMENT_METHODS, allowsInstallments } from "@/lib/payments";
import { AUDIT_STATUS_LABEL } from "@/lib/reconciliation";
import { SaleAttachments } from "@/components/vendas/SaleAttachments";
import { DailySalesDialog } from "@/components/vendas/DailySalesDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PERIODS = [
  { value: "all", label: "Todo o período" },
  { value: "today", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
];
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function inPeriod(date: Date, period: string, now: Date): boolean {
  if (period === "all") return true;
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const diff = (now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
  return period === "today"
    ? new Date(date).toDateString() === now.toDateString()
    : diff <= days;
}

export default function VendasPage() {
  const { sales, salesLoading, devices, accessories, customers, returnSale, updateSale } = useInventoryContext();
  const { user } = useAuth();
  const canCost = can(user?.role, "viewCost");
  const canEditSale = can(user?.role, "editSales");
  const canReturnSale = can(user?.role, "returnSales");
  const canSeeAuditDetail = can(user?.role, "reconcile"); // observação e conferente da conferência financeira

  const devicesById = useMemo(() => buildDeviceMap(devices), [devices]);
  const accessoriesById = useMemo(() => buildAccessoryMap(accessories), [accessories]);

  const [showDaily, setShowDaily] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("all");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");

  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [saving, setSaving] = useState(false);
  const [returnTarget, setReturnTarget] = useState<Sale | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returning, setReturning] = useState(false);

  // Form de edição
  const [eCustomer, setECustomer] = useState("");
  const [eSeller, setESeller] = useState("");
  const [eDiscount, setEDiscount] = useState("");
  const [ePays, setEPays] = useState<{ method: PaymentMethod; amount: string; installments: string }[]>([]);
  const [eTrade, setETrade] = useState("");
  const [eFinal, setEFinal] = useState<string | null>(null); // valor final manual (null = calculado)
  const [eNotes, setENotes] = useState("");
  const [eGiftsCost, setEGiftsCost] = useState("");
  const [eItemPrices, setEItemPrices] = useState<Record<string, string>>({});
  const [eRequiresInvoice, setERequiresInvoice] = useState(false);

  const sellers = useMemo(() => [...new Set(sales.map((s) => s.seller).filter(Boolean))], [sales]);
  const now = new Date();

  const filtered = useMemo(
    () =>
      sales.filter((s) => {
        if (!saleMatchesSearch(s, search, devices)) return false;
        if (status === "active" && isReturned(s)) return false;
        if (status === "returned" && !isReturned(s)) return false;
        if (sellerFilter !== "all" && s.seller !== sellerFilter) return false;
        if (originFilter !== "all" && (s.origin ?? "Balcão") !== originFilter) return false;
        if (!inPeriod(s.createdAt, period, now)) return false;
        return true;
      }),
    [sales, search, status, sellerFilter, originFilter, period, devices]
  );
  const summary = buildSalesSummary(filtered);
  // Lucro líquido acumulado das vendas filtradas (devolvidas não contam) — só admin
  const accumulatedProfit = useMemo(
    () =>
      filtered
        .filter((s) => !isReturned(s))
        .reduce((sum, s) => sum + saleNetProfit(s, devicesById, accessoriesById), 0),
    [filtered, devicesById, accessoriesById]
  );

  const openEdit = (s: Sale) => {
    setEditSale(s);
    setECustomer(s.customer?.id || "");
    setESeller(s.seller || "");
    setEDiscount(String(s.discount ?? 0));
    setENotes(s.notes ?? "");
    setEPays(
      s.payments.length
        ? s.payments.map((p) => ({ method: p.method, amount: String(p.amount), installments: String(p.installments ?? 1) }))
        : [{ method: "PIX", amount: String(s.total), installments: "1" }]
    );
    // se o total salvo foi ajustado à mão (≠ cálculo), mantém como valor final manual
    setEFinal(Math.abs(computeSaleTotal(s.subtotal, s.tradeInDiscount, s.discount ?? 0) - s.total) > 0.005 ? String(s.total) : null);
    setEGiftsCost(String(s.giftsCost ?? 0));
    setETrade(String(s.tradeInDiscount ?? 0));
    setEItemPrices(Object.fromEntries(s.items.map((i) => [i.id, String(i.price)])));
    setERequiresInvoice(s.requiresInvoice ?? false);
  };

  const handleSaveEdit = async () => {
    if (!editSale) return;
    setSaving(true);
    try {
      await updateSale(editSale.id, {
        customerId: eCustomer || undefined,
        sellerName: eSeller,
        discount: Number(eDiscount) || 0,
        items: editSale.items
          .filter((i) => eItemPrices[i.id] !== undefined && eItemPrices[i.id] !== "" && Number(eItemPrices[i.id]) !== i.price)
          .map((i) => ({ id: i.id, price: Number(eItemPrices[i.id]) })),
        giftsCost: Number(eGiftsCost) || 0,
        requiresInvoice: eRequiresInvoice,
        notes: eNotes,
        total: editFinal,
        tradeInValue: editSale.tradeIn ? editTrade : undefined,
        payments: editPayRows.map((r) => ({
          method: r.method,
          amount: r.amount,
          installments: allowsInstallments(r.method) ? Number(r.installments) || 1 : 1,
        })),
      });
      toast.success("Venda atualizada!");
      setEditSale(null);
    } catch {
      // onError do hook avisa
    } finally {
      setSaving(false);
    }
  };

  const editSubtotal = editSale
    ? editSale.items.reduce((sum, i) => {
        const raw = eItemPrices[i.id];
        const price = raw === undefined || raw === "" || !Number.isFinite(Number(raw)) ? i.price : Number(raw);
        return sum + price * i.quantity;
      }, 0)
    : 0;
  const editTrade = editSale?.tradeIn && eTrade.trim() !== "" && Number.isFinite(Number(eTrade)) ? Number(eTrade) : editSale?.tradeInDiscount ?? 0;
  const editTotalPreview = editSale
    ? computeSaleTotal(editSubtotal, editTrade, Number(eDiscount) || 0)
    : 0;

  // Valor final: manual (não altera o desconto); se não for digitado, vale o cálculo
  const editFinal = eFinal !== null && eFinal.trim() !== "" && Number.isFinite(Number(eFinal)) ? Number(eFinal) : editTotalPreview;
  // Com uma única forma de pagamento, o valor acompanha o valor final
  const editPayRows = ePays.map((r) => ({
    ...r,
    amount: ePays.length === 1 ? editFinal : Number(r.amount) || 0,
  }));
  const editPaidSum = editPayRows.reduce((sum, r) => sum + r.amount, 0);
  const editPayDiff = Math.round((editFinal - editPaidSum) * 100) / 100;
  const updateEPay = (idx: number, patch: Partial<{ method: PaymentMethod; amount: string; installments: string }>) =>
    setEPays((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  return (
    <AppLayout wide>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Vendas realizadas</h1>
            <p className="mt-1 text-sm text-muted-foreground">Histórico de vendas e comprovantes: 2ª via do recibo, notas fiscais anexas e edição</p>
          </div>
          <Button onClick={() => setShowDaily(true)} className="gap-2">
            <FileText className="h-4 w-4" /> Relatório do dia
          </Button>
        </div>

        {/* Resumo */}
        <div className={`grid grid-cols-2 gap-4 ${canCost ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
          {[
            { label: "Vendas", value: summary.count },
            { label: "Faturamento líquido", value: fmt(summary.net) },
            { label: "Faturamento bruto", value: fmt(summary.gross) },
            ...(canCost ? [{ label: "Lucro líquido acumulado", value: fmt(accumulatedProfit) }] : []),
            { label: "Devolvidas", value: summary.returned },
          ].map((c) => (
            <Card key={c.label} className="border shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nº da venda, cliente, vendedor, produto, serial ou IMEI..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sellerFilter} onValueChange={setSellerFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos vendedores</SelectItem>
              {sellers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={originFilter} onValueChange={setOriginFilter}>
            <SelectTrigger className="w-36" aria-label="Origem"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda origem</SelectItem>
              <SelectItem value="Balcão">Venda de balcão</SelectItem>
              <SelectItem value="Orçamento">De orçamento</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="returned">Devolvidas</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="ml-auto self-center">{filtered.length} vendas</Badge>
        </div>

        {/* Tabela */}
        <Card className="border shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Total</TableHead>
                    {canCost && <TableHead>Lucro líquido</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} className={isReturned(s) ? "opacity-60" : ""}>
                      <TableCell className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                        {saleNumberLabel(s.saleNumber)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="font-medium">{s.customer?.name || "—"}</TableCell>
                      <TableCell>{s.seller || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={s.origin === "Orçamento" ? "reserved" : "secondary"} className="whitespace-nowrap font-normal">
                          {s.origin === "Orçamento" ? "Orçamento" : "Balcão"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={saleItemsSummary(s)}>
                        {saleItemsSummary(s)}
                      </TableCell>
                      <TableCell className="text-xs">{salePaymentLabel(s)}</TableCell>
                      <TableCell className="font-semibold">{fmt(saleFullValue(s))}</TableCell>
                      {canCost && (
                        <TableCell className="font-semibold text-success">
                          {fmt(saleNetProfit(s, devicesById, accessoriesById))}
                        </TableCell>
                      )}
                      <TableCell>
                        {isReturned(s) ? <Badge variant="secondary">Devolvida</Badge> : <Badge variant="outline">Ativa</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex">
                          <Button variant="ghost" size="icon" title="Detalhes" onClick={() => setViewSale(s)}>
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" title="2ª via do recibo" onClick={() => printReceipt(s, devices)}>
                            <Printer className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          {canEditSale && !isReturned(s) && (
                            <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(s)}>
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                          {canReturn(s, canReturnSale) && (
                            <Button variant="ghost" size="icon" title="Devolver/Estornar" onClick={() => { setReturnTarget(s); setReturnReason(""); }}>
                              <Undo2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={canCost ? 11 : 10} className="py-8 text-center text-muted-foreground">
                        {salesLoading ? "Carregando vendas…" : "Nenhuma venda encontrada."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detalhe da venda */}
      <Dialog open={!!viewSale} onOpenChange={(o) => !o && setViewSale(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Venda {viewSale && <span className="text-muted-foreground">— {saleNumberLabel(viewSale.saleNumber)}</span>}</DialogTitle>
          </DialogHeader>
          {viewSale && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{viewSale.customer?.name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(viewSale.createdAt).toLocaleString("pt-BR")} · {viewSale.seller}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{saleNumberLabel(viewSale.saleNumber)}</Badge>
                  {isReturned(viewSale) && <Badge variant="secondary">Devolvida</Badge>}
                </div>
              </div>
              <div className="rounded-lg border divide-y">
                {viewSale.items.map((i) => {
                  const dev = i.type === "device" ? saleDeviceLines(viewSale, devices).find((l) => l.itemId === i.id) : undefined;
                  return (
                    <div key={i.id} className="px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span>{i.quantity}× {i.name}</span>
                        <span className="text-muted-foreground">{fmt(i.price * i.quantity)}</span>
                      </div>
                      {dev && (dev.serial || dev.imei1 || dev.imei2) && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {dev.serial && <>Nº de série: {dev.serial}</>}
                          {dev.serial && (dev.imei1 || dev.imei2) && " · "}
                          {dev.imei1 && <>IMEI 1: {dev.imei1}</>}
                          {dev.imei1 && dev.imei2 && " · "}
                          {dev.imei2 && <>IMEI 2: {dev.imei2}</>}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {viewSale.tradeIn && (
                <div className="rounded-lg border border-dashed p-3 text-xs">
                  <p className="mb-1 font-medium text-foreground">Aparelho recebido como parte de pagamento</p>
                  <p className="text-muted-foreground">{tradeInModelLine(viewSale.tradeIn)}</p>
                  <p className="text-muted-foreground">
                    {viewSale.tradeIn.serial && <>Nº de série: {viewSale.tradeIn.serial}</>}
                    {viewSale.tradeIn.serial && viewSale.tradeIn.imei && " · "}
                    {viewSale.tradeIn.imei && <>IMEI: {viewSale.tradeIn.imei}</>}
                  </p>
                  <p className="mt-1 font-medium text-success">Entrou por {fmt(viewSale.tradeIn.value)}</p>
                </div>
              )}
              <div className="space-y-1">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(viewSale.subtotal)}</span></div>
                {viewSale.tradeInDiscount > 0 && <div className="flex justify-between text-muted-foreground"><span>Troca</span><span>− {fmt(viewSale.tradeInDiscount)}</span></div>}
                {viewSale.discount > 0 && <div className="flex justify-between text-muted-foreground"><span>Desconto</span><span>− {fmt(viewSale.discount)}</span></div>}
                <div className="flex justify-between font-semibold"><span>Valor total da venda</span><span>{fmt(saleFullValue(viewSale))}</span></div>
                {viewSale.tradeInDiscount > 0 && (
                  <div className="flex justify-between text-muted-foreground"><span>Total pago (após troca)</span><span>{fmt(viewSale.total)}</span></div>
                )}
              </div>
              {canCost && (
                <div className="space-y-1 rounded-lg border p-3">
                  {viewSale.giftsCost > 0 && (
                    <div className="flex justify-between text-muted-foreground"><span>Custo dos brindes</span><span>− {fmt(viewSale.giftsCost)}</span></div>
                  )}
                  {viewSale.requiresInvoice && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Custo de nota fiscal (0,7%)</span>
                      <span>− {fmt(saleDeviceSaleValue(viewSale) * INVOICE_COST_RATE)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-success">
                    <span>Lucro líquido</span>
                    <span>{fmt(saleNetProfit(viewSale, devicesById, accessoriesById))}</span>
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Pagamento</Label>
                <div className="mt-1 space-y-1">
                  {viewSale.payments.map((p) => (
                    <div key={p.id} data-testid="sale-payment">
                      <div className="flex justify-between"><span>{p.method}{p.installments && p.installments > 1 ? ` (${p.installments}x)` : ""}</span><span>{fmt(p.amount)}</span></div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="secondary" data-testid="sale-payment-status" className={p.auditStatus === "Conferido" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : p.auditStatus === "Divergente" ? "bg-red-100 text-red-800 hover:bg-red-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                          Conferência: {AUDIT_STATUS_LABEL[p.auditStatus ?? "Aguardando"]}
                        </Badge>
                        {canSeeAuditDetail && p.auditedAt && (<span className="text-muted-foreground">{p.auditedByName} · {p.auditedAt.toLocaleString("pt-BR")}</span>)}
                        {canSeeAuditDetail && p.auditNote && (<span className="text-muted-foreground">Obs.: {p.auditNote}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {viewSale.notes && (
                <div>
                  <Label className="text-xs text-muted-foreground">Descrição / Observação</Label>
                  <p className="text-sm whitespace-pre-wrap">{viewSale.notes}</p>
                </div>
              )}
              <div className="border-t pt-3">
                <Label className="text-xs text-muted-foreground">Nota fiscal / anexos</Label>
                <div className="mt-2"><SaleAttachments saleId={viewSale.id} /></div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => printReceipt(viewSale, devices)}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir 2ª via
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Editar venda (admin) */}
      <Dialog open={!!editSale} onOpenChange={(o) => !o && setEditSale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Venda</DialogTitle></DialogHeader>
          {editSale && (
            <div className="space-y-3">
              <div>
                <Label>Cliente</Label>
                <Select value={eCustomer} onValueChange={setECustomer}>
                  <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vendedor</Label>
                <Select value={eSeller} onValueChange={setESeller}>
                  <SelectTrigger><SelectValue placeholder="Selecionar vendedor" /></SelectTrigger>
                  <SelectContent>
                    {[...new Set([...sellers, eSeller].filter(Boolean))].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Itens (valor unitário)</Label>
                {editSale.items.map((i) => (
                  <div key={i.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm" title={i.name}>{i.quantity}× {i.name}</span>
                    <Input
                      type="number"
                      className="h-8 w-28"
                      value={eItemPrices[i.id] ?? ""}
                      onChange={(e) => setEItemPrices((prev) => ({ ...prev, [i.id]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              {editSale.tradeIn && (
                <div>
                  <Label>Aparelho de troca — valor da entrada (R$)</Label>
                  <Input type="number" min={0} value={eTrade} onChange={(e) => setETrade(e.target.value)} />
                  <p className="mt-0.5 text-xs text-muted-foreground">{editSale.tradeIn.model}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Desconto (R$)</Label>
                  <Input type="number" value={eDiscount} onChange={(e) => setEDiscount(e.target.value)} />
                </div>
                <div>
                  <Label>Valor final (R$)</Label>
                  <Input type="number" value={eFinal ?? String(editTotalPreview)} onChange={(e) => setEFinal(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Formas de pagamento</Label>
                {ePays.map((r, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <Select value={r.method} onValueChange={(v) => updateEPay(idx, { method: v as PaymentMethod })}>
                      <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                    {allowsInstallments(r.method) && (
                      <Input
                        type="number"
                        min={1}
                        className="h-8 w-16"
                        title="Parcelas"
                        value={r.installments}
                        onChange={(e) => updateEPay(idx, { installments: e.target.value })}
                      />
                    )}
                    <Input
                      type="number"
                      className="h-8 w-28"
                      title="Valor pago nesta forma"
                      value={ePays.length === 1 ? String(editFinal) : r.amount}
                      disabled={ePays.length === 1}
                      onChange={(e) => updateEPay(idx, { amount: e.target.value })}
                    />
                    {ePays.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setEPays((prev) => prev.filter((_, i) => i !== idx))}>
                        Remover
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEPays((prev) => [
                      ...(prev.length === 1 ? [{ ...prev[0], amount: String(editFinal) }] : prev),
                      { method: "PIX", amount: "0", installments: "1" },
                    ])
                  }
                >
                  + Adicionar forma de pagamento
                </Button>
                {ePays.length > 1 && (
                  <p className={"text-xs " + (Math.abs(editPayDiff) > 0.01 ? "text-destructive" : "text-muted-foreground")}>
                    Soma dos pagamentos: {fmt(editPaidSum)}
                    {Math.abs(editPayDiff) > 0.01 ? " · " + (editPayDiff > 0 ? "faltam " : "sobram ") + fmt(Math.abs(editPayDiff)) : " · confere com o valor final"}
                  </p>
                )}
              </div>
              <div>
                <Label>Descrição / Observação</Label>
                <Textarea value={eNotes} onChange={(e) => setENotes(e.target.value)} rows={2} placeholder="Observações da venda" />
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <Label>Custo dos brindes (R$)</Label>
                  <Input type="number" min={0} value={eGiftsCost} onChange={(e) => setEGiftsCost(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Checkbox
                    id="eRequiresInvoice"
                    checked={eRequiresInvoice}
                    onCheckedChange={(v) => setERequiresInvoice(v === true)}
                  />
                  <Label htmlFor="eRequiresInvoice" className="font-normal cursor-pointer">Exigiu nota fiscal</Label>
                </div>
              </div>
              <div className="rounded-lg bg-muted p-3 flex justify-between text-sm">
                <span className="font-medium">Novo total</span>
                <span className="font-semibold">{fmt(editFinal)}</span>
              </div>
              <p className="text-xs text-muted-foreground">A edição de valores não altera o estoque. Para trocar produtos, faça a devolução e uma nova venda.</p>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditSale(null)}>Cancelar</Button>
                <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Devolução / estorno (admin) */}
      <Dialog open={!!returnTarget} onOpenChange={(o) => !o && setReturnTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Devolver / Estornar venda</DialogTitle></DialogHeader>
          {returnTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                A venda de <strong>{fmt(returnTarget.total)}</strong> será estornada e os itens voltam ao estoque. Esta ação não pode ser desfeita.
              </p>
              <div className="space-y-1">
                <Label>Motivo (opcional)</Label>
                <Textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} rows={2} placeholder="Ex.: arrependimento, defeito, troca" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setReturnTarget(null)}>Cancelar</Button>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={returning}
                  onClick={async () => {
                    setReturning(true);
                    try {
                      await returnSale(returnTarget.id, returnReason);
                      toast.success("Venda devolvida e estoque restituído.");
                      setReturnTarget(null);
                    } catch {
                      // onError do hook avisa
                    } finally {
                      setReturning(false);
                    }
                  }}
                >
                  {returning ? "Processando..." : "Confirmar devolução"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <DailySalesDialog open={showDaily} onOpenChange={setShowDaily} sales={sales} devices={devices} userName={user?.name} />
    </AppLayout>
  );
}
