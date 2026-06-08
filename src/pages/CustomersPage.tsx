import { useState, useMemo } from "react";
import { Search, UserPlus, Trash2, Pencil, Download, ShoppingBag, Cake } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { Customer, LeadOrigin } from "@/types/inventory";
import { ApiError } from "@/lib/api";
import {
  isValidCpf, formatCpf, formatPhone, customerMatchesSearch,
  buildCustomerStats, buildCustomerReport, birthdayMonth, formatBirthday,
} from "@/lib/customers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const LEAD_ORIGINS: LeadOrigin[] = ["Instagram", "Indicação", "Tráfego Pago"];
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CustomersPage() {
  const { customers, customersLoading, sales, addCustomer, updateCustomer, deleteCustomer } =
    useInventoryContext();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [filterOrigin, setFilterOrigin] = useState<string>("all");
  const [onlyBirthdays, setOnlyBirthdays] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [historyOf, setHistoryOf] = useState<Customer | null>(null);

  // Form
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [birthday, setBirthday] = useState("");
  const [leadOrigin, setLeadOrigin] = useState<LeadOrigin>("Instagram");

  const resetForm = () => {
    setName(""); setCpf(""); setWhatsapp(""); setBirthday(""); setLeadOrigin("Instagram");
  };
  const openCreate = () => { resetForm(); setEditingId(null); setOpen(true); };
  const openEdit = (c: Customer) => {
    setEditingId(c.id);
    setName(c.name); setCpf(c.cpf || ""); setWhatsapp(c.whatsapp || "");
    setBirthday(c.birthday || ""); setLeadOrigin(c.leadOrigin || "Instagram");
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error("Informe o nome do cliente."); return; }
    if (cpf.trim() && !isValidCpf(cpf)) { toast.error("CPF inválido."); return; }
    const payload = { name: name.trim(), cpf: cpf.trim(), whatsapp: whatsapp.trim(), birthday, leadOrigin };
    setSaving(true);
    try {
      if (editingId) { await updateCustomer(editingId, payload); toast.success("Cliente atualizado!"); }
      else { await addCustomer(payload); toast.success("Cliente cadastrado!"); }
      resetForm(); setEditingId(null); setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar o cliente.");
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => buildCustomerStats(sales), [sales]);
  const now = new Date();
  const report = useMemo(() => buildCustomerReport(customers, stats, now), [customers, stats]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (!customerMatchesSearch(c, search)) return false;
      if (filterOrigin !== "all" && (c.leadOrigin || "—") !== filterOrigin) return false;
      if (onlyBirthdays && birthdayMonth(c.birthday) !== now.getMonth() + 1) return false;
      return true;
    });
  }, [customers, search, filterOrigin, onlyBirthdays]);

  const exportCSV = () => {
    const headers = ["Nome", "CPF", "WhatsApp", "Aniversário", "Origem", "Compras", "Total gasto", "Cadastro"];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = filtered.map((c) => {
      const st = stats[c.id];
      return [
        c.name, c.cpf, c.whatsapp, c.birthday, c.leadOrigin || "",
        st?.count ?? 0, (st?.total ?? 0).toFixed(2),
        new Date(c.createdAt).toLocaleDateString("pt-BR"),
      ].map((v) => esc(String(v))).join(";");
    });
    const csv = "﻿" + [headers.map(esc).join(";"), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const historySales = useMemo(
    () => (historyOf ? sales.filter((s) => s.customer?.id === historyOf.id) : []),
    [historyOf, sales]
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
            <p className="mt-1 text-sm text-muted-foreground">Base de clientes cadastrados</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button onClick={openCreate}>
              <UserPlus className="mr-2 h-4 w-4" /> Novo Cliente
            </Button>
          </div>
        </div>

        {/* Resumo */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total de clientes", value: report.total },
            { label: "Já compraram", value: report.buyers },
            { label: "Novos no mês", value: report.newThisMonth },
            { label: "Aniversariantes do mês", value: customers.filter((c) => birthdayMonth(c.birthday) === now.getMonth() + 1).length },
          ].map((c) => (
            <Card key={c.label} className="border shadow-none">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Busca + filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF ou WhatsApp..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterOrigin} onValueChange={setFilterOrigin}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Origem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              {LEAD_ORIGINS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={onlyBirthdays ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setOnlyBirthdays((v) => !v)}
          >
            <Cake className="h-4 w-4" /> Aniversariantes
          </Button>
          {(filterOrigin !== "all" || search || onlyBirthdays) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterOrigin("all"); setSearch(""); setOnlyBirthdays(false); }}>
              Limpar
            </Button>
          )}
          <Badge variant="secondary" className="ml-auto self-center">{filtered.length} clientes</Badge>
        </div>

        {/* Tabela */}
        <Card className="border shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Aniversário</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Compras</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const st = stats[c.id];
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.cpf ? formatCpf(c.cpf) : "—"}</TableCell>
                        <TableCell>{c.whatsapp ? formatPhone(c.whatsapp) : "—"}</TableCell>
                        <TableCell>{formatBirthday(c.birthday)}</TableCell>
                        <TableCell><Badge variant="secondary">{c.leadOrigin}</Badge></TableCell>
                        <TableCell>
                          {st?.count ? (
                            <button className="text-left hover:underline" onClick={() => setHistoryOf(c)} title="Ver histórico">
                              <span className="font-medium text-success">{st.count}×</span>{" "}
                              <span className="text-xs text-muted-foreground">{fmt(st.total)}</span>
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell>
                          <div className="flex">
                            <Button variant="ghost" size="icon" onClick={() => setHistoryOf(c)} title="Histórico de compras">
                              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Editar">
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            {isAdmin && (
                              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(c)} title="Excluir">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        {customersLoading ? "Carregando clientes…" : "Nenhum cliente encontrado."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog: criar / editar */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { resetForm(); setEditingId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>CPF</Label>
                <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1">
                <Label>WhatsApp</Label>
                <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Aniversário</Label>
                <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Origem do Lead</Label>
                <Select value={leadOrigin} onValueChange={(v) => setLeadOrigin(v as LeadOrigin)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_ORIGINS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { resetForm(); setEditingId(null); setOpen(false); }}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Salvar" : "Cadastrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Histórico de compras */}
      <Dialog open={!!historyOf} onOpenChange={(o) => !o && setHistoryOf(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Compras de {historyOf?.name}</DialogTitle>
          </DialogHeader>
          {historySales.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Este cliente ainda não realizou compras.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto py-2">
              {historySales.map((s) => (
                <div key={s.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{new Date(s.createdAt).toLocaleDateString("pt-BR")}</span>
                    <span className="font-semibold">{fmt(s.total)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>Tem certeza que deseja excluir <strong>{deleteTarget.name}</strong>? Clientes com vendas não podem ser excluídos.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deleteCustomer(deleteTarget.id); setDeleteTarget(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
