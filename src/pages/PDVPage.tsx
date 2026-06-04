import { useState, useRef, useEffect } from "react";
import { Search, ScanLine, ShoppingCart, Plus, Trash2, Repeat, Printer, UserPlus, Package } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import {
  Customer, CartItem, PaymentEntry, TradeIn, PaymentMethod, LeadOrigin, Seller,
} from "@/types/inventory";
import { printReceipt } from "@/utils/receiptGenerator";
import { ApiError } from "@/lib/api";
import { formatCapacity } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const PAYMENT_METHODS: PaymentMethod[] = ["PIX", "Dinheiro", "Cartão de Crédito", "Cartão de Débito"];
const SELLERS: Seller[] = ["Gabriel", "Matheus", "Tassio"];
const LEAD_ORIGINS: LeadOrigin[] = ["Instagram", "Indicação", "Tráfego Pago"];

export default function PDVPage() {
  const {
    devices, accessories, customers, findCustomer, addCustomer,
    findDeviceBySerial, getCompatibleAccessories, finalizeSale,
  } = useInventoryContext();

  // Customer
  const [customerQuery, setCustomerQuery] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCpf, setNewCpf] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [newBirthday, setNewBirthday] = useState("");
  const [newLeadOrigin, setNewLeadOrigin] = useState<LeadOrigin>("Instagram");

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [imeiQuery, setImeiQuery] = useState("");
  const imeiRef = useRef<HTMLInputElement>(null);

  // Suggestions
  const [suggestions, setSuggestions] = useState<ReturnType<typeof getCompatibleAccessories>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Payments
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("PIX");
  const [payAmount, setPayAmount] = useState("");
  const [payInstallments, setPayInstallments] = useState("1");

  // Trade-in
  const [showTradeIn, setShowTradeIn] = useState(false);
  const [tradeIn, setTradeIn] = useState<TradeIn | null>(null);
  const [tradeImei, setTradeImei] = useState("");
  const [tradeModel, setTradeModel] = useState("");
  const [tradeHealth, setTradeHealth] = useState("");
  const [tradeValue, setTradeValue] = useState("");

  // Seller
  const [seller, setSeller] = useState<Seller>("Gabriel");

  // Focus IMEI input
  useEffect(() => { imeiRef.current?.focus(); }, []);

  // ---------- Customer ----------
  const [showCustomerResults, setShowCustomerResults] = useState(false);

  const filteredCustomers = customerQuery.trim().length >= 2
    ? customers.filter((c) => {
        const q = customerQuery.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.cpf.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ||
          c.whatsapp.replace(/\D/g, "").includes(q.replace(/\D/g, ""))
        );
      })
    : [];

  const selectCustomer = (c: Customer) => {
    setCustomer(c);
    setCustomerQuery("");
    setShowCustomerResults(false);
    toast.success(`Cliente selecionado: ${c.name}`);
  };

  const handleCustomerSearch = () => {
    if (filteredCustomers.length === 1) {
      selectCustomer(filteredCustomers[0]);
    } else if (filteredCustomers.length === 0) {
      toast.info("Cliente não encontrado. Cadastre um novo.");
      setShowNewCustomer(true);
      setNewCpf(customerQuery);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newName || !newCpf) return;
    try {
      const c = await addCustomer({
        name: newName, cpf: newCpf, whatsapp: newWhatsapp,
        birthday: newBirthday, leadOrigin: newLeadOrigin,
      });
      setCustomer(c);
      setShowNewCustomer(false);
      setNewName(""); setNewCpf(""); setNewWhatsapp(""); setNewBirthday("");
      toast.success("Cliente cadastrado!");
    } catch {
      toast.error("Não foi possível cadastrar o cliente.");
    }
  };

  // ---------- Device search ----------
  const [showDeviceResults, setShowDeviceResults] = useState(false);

  const availableDevices = devices.filter(
    (d) => (d.status === "Disponível" || d.status === "Reservado") && !cart.some((c) => c.deviceId === d.id)
  );

  const filteredDevices = imeiQuery.trim().length >= 2
    ? availableDevices.filter((d) => {
        const q = imeiQuery.trim().toLowerCase();
        return (
          d.model.toLowerCase().includes(q) ||
          d.serialImei.toLowerCase().includes(q) ||
          d.internalSerial.toLowerCase().includes(q) ||
          d.color.toLowerCase().includes(q)
        );
      })
    : [];

  const addDeviceToCart = (device: typeof devices[0]) => {
    if (cart.some((c) => c.deviceId === device.id)) {
      toast.warning("Aparelho já adicionado ao carrinho.");
      return;
    }
    const item: CartItem = {
      id: crypto.randomUUID(),
      type: "device",
      deviceId: device.id,
      name: `${device.model} ${formatCapacity(device.capacity)} ${device.color}`.trim(),
      serial: device.serialImei || device.internalSerial,
      price: device.cost,
      quantity: 1,
    };
    setCart((prev) => [...prev, item]);
    setImeiQuery("");
    setShowDeviceResults(false);
    toast.success("Aparelho adicionado ao carrinho!");

    const compat = getCompatibleAccessories(device.model);
    if (compat.length > 0) {
      setSuggestions(compat);
      setShowSuggestions(true);
    }
  };

  const handleImeiSearch = () => {
    if (!imeiQuery.trim()) return;
    // Try exact serial match first
    const device = findDeviceBySerial(imeiQuery);
    if (device) {
      addDeviceToCart(device);
    } else if (filteredDevices.length === 1) {
      addDeviceToCart(filteredDevices[0]);
    } else if (filteredDevices.length > 1) {
      setShowDeviceResults(true);
    } else {
      toast.error("Aparelho não encontrado ou indisponível.");
    }
  };

  const addAccessoryToCart = (accId: string) => {
    const acc = accessories.find((a) => a.id === accId);
    if (!acc || acc.quantity <= 0) return;
    const existing = cart.find((c) => c.accessoryId === accId);
    if (existing) {
      setCart((prev) =>
        prev.map((c) => (c.accessoryId === accId ? { ...c, quantity: c.quantity + 1 } : c))
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "accessory",
          accessoryId: accId,
          name: acc.name,
          price: acc.price || acc.cost * 2,
          quantity: 1,
        },
      ]);
    }
    toast.success(`${acc.name} adicionado!`);
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((c) => c.id !== id));

  // ---------- Payments ----------
  const addPayment = () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return;
    setPayments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        method: payMethod,
        amount,
        installments: payMethod === "Cartão de Crédito" ? Number(payInstallments) : undefined,
      },
    ]);
    setPayAmount("");
  };

  const removePayment = (id: string) => setPayments((prev) => prev.filter((p) => p.id !== id));

  // ---------- Trade-in ----------
  const handleAddTradeIn = () => {
    const val = Number(tradeValue);
    if (!tradeModel || !val) return;
    setTradeIn({ imei: tradeImei, model: tradeModel, healthDescription: tradeHealth, value: val });
    setShowTradeIn(false);
    toast.success("Aparelho de troca adicionado.");
  };

  // ---------- Totals ----------
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tradeInDiscount = tradeIn?.value || 0;
  const total = subtotal - tradeInDiscount;
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = total - totalPaid;

  // ---------- Finalize ----------
  const [finalizing, setFinalizing] = useState(false);

  const handleFinalize = async () => {
    if (!customer) { toast.error("Selecione um cliente."); return; }
    if (cart.length === 0) { toast.error("Carrinho vazio."); return; }
    if (remaining > 0.01) { toast.error("Pagamento insuficiente."); return; }

    setFinalizing(true);
    try {
      const sale = await finalizeSale({
        customer,
        items: cart,
        payments,
        tradeIn: tradeIn || undefined,
        seller,
        subtotal,
        tradeInDiscount,
        total,
      });

      printReceipt(sale, devices);
      toast.success("Venda finalizada com sucesso!");
      // Reset
      setCart([]); setPayments([]); setTradeIn(null); setCustomer(null);
      setCustomerQuery(""); setImeiQuery("");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Falha ao registrar a venda. Tente novamente."
      );
    } finally {
      setFinalizing(false);
    }
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Frente de Caixa</h1>
          <p className="mt-1 text-sm text-muted-foreground">PDV – Ponto de Venda</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: inputs */}
          <div className="space-y-4 lg:col-span-2">
            {/* Step 1: Customer */}
            <Card className="border shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Search className="h-4 w-4 text-primary" />
                  1. Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {customer ? (
                  <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                    <div>
                      <p className="font-medium text-foreground">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">CPF: {customer.cpf} · WhatsApp: {customer.whatsapp}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>Trocar</Button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Buscar por nome, CPF ou WhatsApp..."
                        value={customerQuery}
                        onChange={(e) => { setCustomerQuery(e.target.value); setShowCustomerResults(true); }}
                        onKeyDown={(e) => e.key === "Enter" && handleCustomerSearch()}
                        onFocus={() => setShowCustomerResults(true)}
                      />
                      <Button onClick={handleCustomerSearch}>Buscar</Button>
                      <Button variant="outline" onClick={() => setShowNewCustomer(true)}>
                        <UserPlus className="mr-2 h-4 w-4" /> Novo
                      </Button>
                    </div>
                    {showCustomerResults && filteredCustomers.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-lg">
                        {filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                            onClick={() => selectCustomer(c)}
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-foreground truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground">CPF: {c.cpf} · {c.whatsapp}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 2: Buscar Aparelho */}
            <Card className="border shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ScanLine className="h-4 w-4 text-primary" />
                  2. Buscar Aparelho
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        ref={imeiRef}
                        placeholder="Buscar por modelo, IMEI, serial ou cor..."
                        value={imeiQuery}
                        onChange={(e) => { setImeiQuery(e.target.value); setShowDeviceResults(true); }}
                        onKeyDown={(e) => e.key === "Enter" && handleImeiSearch()}
                        onFocus={() => setShowDeviceResults(true)}
                        className="pr-10"
                      />
                      <ScanLine className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    </div>
                    <Button onClick={handleImeiSearch}>Adicionar</Button>
                  </div>
                  {showDeviceResults && filteredDevices.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border bg-popover shadow-lg">
                      {filteredDevices.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                          onClick={() => addDeviceToCart(d)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">
                              {d.model} · {formatCapacity(d.capacity)} · {d.color}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {d.condition} · Bateria: {d.batteryHealth}% · {d.serialImei || d.internalSerial}
                            </p>
                          </div>
                          <span className="ml-3 whitespace-nowrap text-sm font-semibold">
                            {d.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Step 3: Payments */}
            <Card className="border shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  3. Pagamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {payMethod === "Cartão de Crédito" && (
                    <Select value={payInstallments} onValueChange={setPayInstallments}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    type="number"
                    placeholder="Valor R$"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-36"
                    onKeyDown={(e) => e.key === "Enter" && addPayment()}
                  />
                  <Button variant="outline" onClick={addPayment}>
                    <Plus className="mr-1 h-4 w-4" /> Adicionar
                  </Button>
                </div>

                {payments.length > 0 && (
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded bg-muted px-3 py-2 text-sm">
                        <span>
                          {p.method}
                          {p.installments && p.installments > 1 ? ` ${p.installments}x` : ""}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{fmt(p.amount)}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePayment(p.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowTradeIn(true)}
                    className="gap-2"
                  >
                    <Repeat className="h-4 w-4" />
                    Aparelho de Troca
                  </Button>
                </div>

                {tradeIn && (
                  <div className="flex items-center justify-between rounded border border-dashed border-success bg-success/5 px-3 py-2 text-sm">
                    <span>Trade-in: {tradeIn.model} (IMEI: {tradeIn.imei})</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-success">-{fmt(tradeIn.value)}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTradeIn(null)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Seller + Finalize */}
            <Card className="border shadow-none">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex items-center gap-2">
                  <Label>Vendedor:</Label>
                  <Select value={seller} onValueChange={(v) => setSeller(v as Seller)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SELLERS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="ml-auto gap-2"
                  size="lg"
                  onClick={handleFinalize}
                  disabled={finalizing || cart.length === 0 || !customer || remaining > 0.01}
                >
                  <Printer className="h-4 w-4" />
                  {finalizing ? "Registrando..." : "Finalizar Venda"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Cart summary */}
          <div className="space-y-4">
            <Card className="border shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="h-4 w-4" />
                  Carrinho
                  {cart.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">{cart.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cart.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Bipe um IMEI para começar
                  </p>
                ) : (
                  <>
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground leading-tight">{item.name}</p>
                          {item.serial && (
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{item.serial}</p>
                          )}
                          {item.type === "accessory" && (
                            <p className="text-xs text-muted-foreground">Qtd: {item.quantity}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="whitespace-nowrap text-sm font-semibold">{fmt(item.price * item.quantity)}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFromCart(item.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {cart.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{fmt(subtotal)}</span>
                      </div>
                      {tradeInDiscount > 0 && (
                        <div className="flex justify-between text-success">
                          <span>Trade-in</span>
                          <span>-{fmt(tradeInDiscount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-bold">
                        <span>Total</span>
                        <span>{fmt(total)}</span>
                      </div>
                      {totalPaid > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pago</span>
                          <span>{fmt(totalPaid)}</span>
                        </div>
                      )}
                      {remaining > 0.01 && (
                        <div className="flex justify-between font-medium text-destructive">
                          <span>Restante</span>
                          <span>{fmt(remaining)}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* New Customer Modal */}
      <Dialog open={showNewCustomer} onOpenChange={setShowNewCustomer}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>CPF *</Label>
                <Input value={newCpf} onChange={(e) => setNewCpf(e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1">
                <Label>WhatsApp</Label>
                <Input value={newWhatsapp} onChange={(e) => setNewWhatsapp(e.target.value)} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Aniversário</Label>
                <Input type="date" value={newBirthday} onChange={(e) => setNewBirthday(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Origem do Lead</Label>
                <Select value={newLeadOrigin} onValueChange={(v) => setNewLeadOrigin(v as LeadOrigin)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_ORIGINS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowNewCustomer(false)}>Cancelar</Button>
              <Button onClick={handleCreateCustomer}>Cadastrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Suggestions Modal */}
      <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Acessórios Compatíveis
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto py-2">
            {suggestions.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted"
              >
                <div>
                  <p className="text-sm font-medium">{acc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {acc.category} · {acc.subcategory} · Estoque: {acc.quantity}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => addAccessoryToCart(acc.id)}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar
                </Button>
              </div>
            ))}
            {suggestions.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhum acessório compatível encontrado.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Trade-in Modal */}
      <Dialog open={showTradeIn} onOpenChange={setShowTradeIn}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="h-5 w-5 text-primary" />
              Aparelho de Troca
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>IMEI do Aparelho</Label>
              <Input value={tradeImei} onChange={(e) => setTradeImei(e.target.value)} placeholder="IMEI" />
            </div>
            <div className="space-y-1">
              <Label>Modelo</Label>
              <Input value={tradeModel} onChange={(e) => setTradeModel(e.target.value)} placeholder="Ex: iPhone 12 64GB" />
            </div>
            <div className="space-y-1">
              <Label>Descrição / Saúde da Bateria</Label>
              <Input value={tradeHealth} onChange={(e) => setTradeHealth(e.target.value)} placeholder="Ex: Bateria 85%, tela ok" />
            </div>
            <div className="space-y-1">
              <Label>Valor da Avaliação (R$)</Label>
              <Input type="number" value={tradeValue} onChange={(e) => setTradeValue(e.target.value)} placeholder="0,00" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowTradeIn(false)}>Cancelar</Button>
              <Button onClick={handleAddTradeIn}>Confirmar Troca</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
