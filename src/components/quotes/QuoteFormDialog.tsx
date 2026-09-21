import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Accessory, Customer, Device } from "@/types/inventory";
import { Quote, QuoteInput } from "@/types/quote";
import { ApiError } from "@/lib/api";
import { formatCapacity } from "@/lib/utils";
import { accessorySellPrice, deviceSellPrice } from "@/lib/pdv";
import { DEFAULT_PAYMENT_TERMS, defaultValidUntil, quoteTotals } from "@/lib/quotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// yyyy-mm-dd no fuso local (para o <input type="date">)
const toDateInput = (d?: Date) => {
  if (!d) return "";
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

type FormItem = QuoteInput["items"][number] & { key: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote?: Quote | null; // edição
  template?: Quote | null; // duplicar: preenche como novo
  devices: Device[];
  accessories: Accessory[];
  customers: Customer[];
  sellerOptions: string[];
  defaultSeller: string;
  onSubmit: (input: QuoteInput) => Promise<unknown>;
}

export function QuoteFormDialog({
  open, onOpenChange, quote, template, devices, accessories, customers, sellerOptions, defaultSeller, onSubmit,
}: Props) {
  const source = quote ?? template ?? null;
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [seller, setSeller] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<FormItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_PAYMENT_TERMS);
  const [notes, setNotes] = useState("");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [accQuery, setAccQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [saving, setSaving] = useState(false);

  // Carrega os dados sempre que o diálogo abre
  useEffect(() => {
    if (!open) return;
    setCustomerId(source?.customerId);
    setCustomerName(source?.customerName ?? "");
    setCustomerPhone(source?.customerPhone ?? "");
    setSeller(source?.sellerName || defaultSeller);
    // duplicar gera uma validade nova; editar mantém a existente
    setValidUntil(toDateInput(quote ? quote.validUntil : defaultValidUntil()));
    setItems(
      (source?.items ?? []).map((i) => ({
        key: crypto.randomUUID(), type: i.type, productId: i.productId, name: i.name,
        serial: i.serial, price: i.price, quantity: i.quantity,
      }))
    );
    setDiscount(source && source.discount ? String(source.discount) : "");
    setPaymentTerms(source?.paymentTerms ?? DEFAULT_PAYMENT_TERMS);
    setNotes(source?.notes ?? "");
    setDeviceQuery(""); setAccQuery(""); setManualName(""); setManualPrice(""); setShowCustomerList(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote?.id, template?.id]);

  const { subtotal, total } = quoteTotals(items, Number(discount) || 0);

  const customerMatches = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (q.length < 2 || customerId) return [];
    const digits = q.replace(/\D/g, "");
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (digits && (c.cpf.replace(/\D/g, "").includes(digits) || c.whatsapp.replace(/\D/g, "").includes(digits)))
      )
      .slice(0, 6);
  }, [customerName, customerId, customers]);

  const pickCustomer = (c: Customer) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.whatsapp);
    setShowCustomerList(false);
  };
  const clearCustomer = () => { setCustomerId(undefined); setCustomerName(""); setCustomerPhone(""); };

  const usedProducts = new Set(items.map((i) => i.productId).filter(Boolean));
  const deviceResults = useMemo(() => {
    const q = deviceQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return devices
      .filter((d) => (d.status === "Disponível" || d.status === "Reservado") && !usedProducts.has(d.id))
      .filter((d) =>
        [d.model, d.brand, d.color, d.capacity, d.serialImei, d.imei2, d.serial, d.internalSerial]
          .join(" ").toLowerCase().includes(q)
      )
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceQuery, devices, items]);
  const accResults = useMemo(() => {
    const q = accQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    return accessories
      .filter((a) => a.quantity > 0 && !usedProducts.has(a.id))
      .filter((a) => `${a.name} ${a.barcode} ${a.compatibleModel}`.toLowerCase().includes(q))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accQuery, accessories, items]);

  const addDevice = (d: Device) => {
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(), type: "device", productId: d.id,
        name: `${d.model} ${formatCapacity(d.capacity)} ${d.color}`.trim(),
        serial: d.serialImei || d.internalSerial || undefined, price: deviceSellPrice(d), quantity: 1,
      },
    ]);
    setDeviceQuery("");
  };
  const addAccessory = (a: Accessory) => {
    setItems((prev) => [
      ...prev,
      { key: crypto.randomUUID(), type: "accessory", productId: a.id, name: a.name, price: accessorySellPrice(a), quantity: 1 },
    ]);
    setAccQuery("");
  };
  const addManual = () => {
    const price = Number(manualPrice);
    if (!manualName.trim() || !(price >= 0) || manualPrice === "") {
      toast.error("Informe o nome e o valor do item avulso.");
      return;
    }
    setItems((prev) => [
      ...prev,
      { key: crypto.randomUUID(), type: "device", name: manualName.trim(), price, quantity: 1 },
    ]);
    setManualName(""); setManualPrice("");
  };
  const patchItem = (key: string, patch: Partial<FormItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const handleSubmit = async () => {
    if (!customerName.trim()) { toast.error("Informe o cliente."); return; }
    if (items.length === 0) { toast.error("Selecione pelo menos um aparelho ou acessório para o orçamento."); return; }
    if (items.some((i) => !(i.price >= 0))) { toast.error("Há item com valor inválido."); return; }
    const input: QuoteInput = {
      customerId: customerId ?? null,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      sellerName: seller,
      validUntil: validUntil ? new Date(`${validUntil}T23:59:59`) : undefined,
      discount: Number(discount) || 0,
      paymentTerms: paymentTerms.trim(),
      notes: notes.trim(),
      items: items.map(({ key: _key, ...rest }) => rest),
    };
    setSaving(true);
    try {
      await onSubmit(input);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar o orçamento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{quote ? `Editar orçamento nº ${quote.number}` : "Novo orçamento"}</DialogTitle>
          <DialogDescription>
            Monte a proposta com aparelhos e acessórios do estoque. O orçamento não reserva o produto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Cliente */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative space-y-1 sm:col-span-2">
              <Label>Cliente</Label>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={customerName}
                  onChange={(e) => { setCustomerName(e.target.value); setCustomerId(undefined); setShowCustomerList(true); }}
                  onFocus={() => setShowCustomerList(true)}
                  placeholder="Nome (busque um cliente cadastrado ou digite um avulso)"
                  className="pl-9 pr-9"
                  aria-label="Cliente"
                />
                {customerName && (
                  <button type="button" onClick={clearCustomer} aria-label="Limpar cliente"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {showCustomerList && customerMatches.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-lg" data-testid="customer-results">
                  {customerMatches.map((c) => (
                    <button key={c.id} type="button" onClick={() => pickCustomer(c)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{c.whatsapp || c.cpf}</span>
                    </button>
                  ))}
                </div>
              )}
              {customerId && <p className="text-xs text-success">Cliente cadastrado vinculado.</p>}
            </div>
            <div className="space-y-1">
              <Label>WhatsApp / telefone</Label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(11) 90000-0000" aria-label="Telefone" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Vendedor</Label>
              <Input list="quote-sellers" value={seller} onChange={(e) => setSeller(e.target.value)} aria-label="Vendedor" />
              <datalist id="quote-sellers">{sellerOptions.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div className="space-y-1">
              <Label>Válido até</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} aria-label="Validade" />
            </div>
            <div className="space-y-1">
              <Label>Condições de pagamento</Label>
              <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} aria-label="Condições de pagamento" />
            </div>
          </div>

          {/* Itens */}
          <div className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">Produtos da proposta</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={deviceQuery} onChange={(e) => setDeviceQuery(e.target.value)}
                  placeholder="Buscar aparelho (modelo, cor, IMEI)…" className="pl-9" aria-label="Buscar aparelho" />
                {deviceResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border bg-popover shadow-lg" data-testid="device-results">
                    {deviceResults.map((d) => (
                      <button key={d.id} type="button" onClick={() => addDevice(d)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{d.model} {formatCapacity(d.capacity)} {d.color}</span>
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">{d.serialImei || d.serial || d.internalSerial} · {d.condition}</span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold">{fmt(deviceSellPrice(d))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={accQuery} onChange={(e) => setAccQuery(e.target.value)}
                  placeholder="Buscar acessório…" className="pl-9" aria-label="Buscar acessório" />
                {accResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border bg-popover shadow-lg" data-testid="accessory-results">
                    {accResults.map((a) => (
                      <button key={a.id} type="button" onClick={() => addAccessory(a)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{a.name}</span>
                          <span className="block text-[11px] text-muted-foreground">Estoque: {a.quantity}</span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold">{fmt(accessorySellPrice(a))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Item avulso (fora do estoque, ex.: sob encomenda)</Label>
                <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Descrição" aria-label="Item avulso" />
              </div>
              <div className="w-32 space-y-1">
                <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                <Input type="number" min={0} value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} aria-label="Valor do item avulso" />
              </div>
              <Button type="button" variant="outline" onClick={addManual} className="gap-1">
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="rounded-lg bg-muted/50 py-4 text-center text-sm text-muted-foreground">
                Nenhum produto ainda. Busque um aparelho ou acessório acima.
              </p>
            ) : (
              <div className="divide-y rounded-lg border" data-testid="quote-items">
                {items.map((i) => (
                  <div key={i.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-medium">{i.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {i.type === "device" ? "Aparelho" : "Acessório"}
                        {!i.productId && " · avulso"}
                        {i.serial ? ` · ${i.serial}` : ""}
                      </p>
                    </div>
                    {i.type === "accessory" && (
                      <Input type="number" min={1} value={i.quantity} aria-label={`Quantidade de ${i.name}`}
                        onChange={(e) => patchItem(i.key, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                        className="h-8 w-16" />
                    )}
                    <Input type="number" min={0} value={i.price} aria-label={`Valor de ${i.name}`}
                      onChange={(e) => patchItem(i.key, { price: Math.max(0, Number(e.target.value) || 0) })}
                      className="h-8 w-28" />
                    <span className="w-24 text-right text-sm font-semibold">{fmt(i.price * i.quantity)}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Remover" aria-label={`Remover ${i.name}`}
                      onClick={() => setItems((prev) => prev.filter((x) => x.key !== i.key))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex.: entrega em mãos, cor sob consulta…" />
            </div>
            <div className="space-y-1">
              <Label>Desconto (R$)</Label>
              <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} aria-label="Desconto" />
            </div>
          </div>

          <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            {Number(discount) > 0 && (
              <div className="flex justify-between text-muted-foreground"><span>Desconto</span><span>− {fmt(Number(discount))}</span></div>
            )}
            <div className="flex justify-between text-base font-semibold"><span>Total</span><span data-testid="quote-total">{fmt(total)}</span></div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Salvando..." : quote ? "Salvar alterações" : "Gerar orçamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
