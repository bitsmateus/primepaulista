import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Eye, Loader2, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { api, ApiError, Supplier, SupplierInput } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";
import { useSuppliers, useSupplierMutations } from "@/hooks/useSuppliers";
import { formatDocument, isValidDocument, normSupplierName } from "@/lib/suppliers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogAction,
} from "@/components/ui/alert-dialog";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDay = (s?: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

const EMPTY: Required<SupplierInput> = { name: "", document: "", phone: "", email: "", address: "", notes: "", active: true };

export default function SuppliersPage() {
  const { user } = useAuth();
  const canManage = can(user?.role, "manageSuppliers");
  const canDelete = can(user?.role, "deleteRecords");
  const { data: suppliers = [], isLoading } = useSuppliers({});
  const { create, update, remove } = useSupplierMutations();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ativos" | "inativos" | "todos">("ativos");

  const filtered = useMemo(() => {
    const q = normSupplierName(search);
    const digits = search.replace(/\D/g, "");
    return suppliers.filter((s) => {
      if (status === "ativos" && !s.active) return false;
      if (status === "inativos" && s.active) return false;
      if (!q) return true;
      return (
        normSupplierName(s.name).includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        (digits.length > 0 && s.document.includes(digits))
      );
    });
  }, [suppliers, search, status]);

  // ----- Formulário (novo / editar) -----
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Required<SupplierInput>>(EMPTY);
  const set = (patch: Partial<SupplierInput>) => setForm((f) => ({ ...f, ...patch }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, document: s.document, phone: s.phone, email: s.email, address: s.address, notes: s.notes, active: s.active });
    setFormOpen(true);
  };
  const save = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome do fornecedor.");
    if (!isValidDocument(form.document)) return toast.error("CPF/CNPJ inválido: informe 11 ou 14 dígitos.");
    const payload = { ...form, name: form.name.trim(), document: form.document.replace(/\D/g, "") };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Fornecedor atualizado.");
      } else {
        await create.mutateAsync(payload);
        toast.success("Fornecedor cadastrado.");
      }
      setFormOpen(false);
    } catch {
      /* o toast de erro já foi mostrado pelo hook */
    }
  };
  const saving = create.isPending || update.isPending;

  // ----- Ficha -----
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["supplier", detailId],
    queryFn: () => api.getSupplier(detailId as string),
    enabled: !!detailId,
  });

  // ----- Inativar / reativar -----
  const toggleActive = async (s: Supplier) => {
    try {
      await update.mutateAsync({ id: s.id, patch: { active: !s.active } });
      toast.success(s.active ? `Fornecedor "${s.name}" inativado.` : `Fornecedor "${s.name}" reativado.`);
    } catch {
      /* toast já exibido */
    }
  };

  // ----- Excluir (bloqueado se houver aparelhos/contas: oferece inativar) -----
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [blockedTarget, setBlockedTarget] = useState<Supplier | null>(null);
  const [blockedMsg, setBlockedMsg] = useState("");
  const askDelete = (s: Supplier) => {
    if ((s.deviceCount ?? 0) > 0 || (s.payableCount ?? 0) > 0) {
      setBlockedMsg(`Este fornecedor tem ${s.deviceCount ?? 0} aparelho(s) e ${s.payableCount ?? 0} conta(s) a pagar ligados e não pode ser excluído.`);
      setBlockedTarget(s);
    } else {
      setDeleteTarget(s);
    }
  };
  const confirmDelete = async () => {
    const s = deleteTarget;
    if (!s) return;
    try {
      await remove.mutateAsync(s.id);
      toast.success(`Fornecedor "${s.name}" excluído.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBlockedMsg(err.message);
        setBlockedTarget(s);
      } else {
        toast.error(err instanceof ApiError ? err.message : "Não foi possível excluir.");
      }
    } finally {
      setDeleteTarget(null);
    }
  };

  const d = detail.data;
  const showTotals = d && d.totalPurchased !== undefined;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Fornecedores</h1>
            <p className="mt-1 text-sm text-muted-foreground">De quem você compra os aparelhos: cadastro, compras e contas a pagar</p>
          </div>
          {canManage && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Novo fornecedor
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome, CPF/CNPJ, telefone ou e-mail…" aria-label="Buscar fornecedor" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-44" aria-label="Situação do fornecedor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Ativos</SelectItem>
              <SelectItem value="inativos">Inativos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="border shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead className="text-center">Aparelhos</TableHead>
                    <TableHead className="text-center">Contas</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} data-supplier={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs">{formatDocument(s.document) || "—"}</TableCell>
                      <TableCell className="text-xs">{s.phone || "—"}</TableCell>
                      <TableCell className="text-xs">{s.email || "—"}</TableCell>
                      <TableCell className="text-center">{s.deviceCount ?? 0}</TableCell>
                      <TableCell className="text-center">{s.payableCount ?? 0}</TableCell>
                      <TableCell>{s.active ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Ver ficha" aria-label={`Ver ficha de ${s.name}`} onClick={() => setDetailId(s.id)}>
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          {canManage && (
                            <>
                              <Button variant="ghost" size="icon" title="Editar" aria-label={`Editar ${s.name}`} onClick={() => openEdit(s)}>
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" title={s.active ? "Inativar" : "Reativar"} aria-label={`${s.active ? "Inativar" : "Reativar"} ${s.name}`} onClick={() => toggleActive(s)}>
                                {s.active ? <Ban className="h-4 w-4 text-muted-foreground" /> : <RotateCcw className="h-4 w-4 text-muted-foreground" />}
                              </Button>
                            </>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="icon" title="Excluir" aria-label={`Excluir ${s.name}`} onClick={() => askDelete(s)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        {isLoading ? "Carregando fornecedores…" : "Nenhum fornecedor encontrado."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Novo / editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
            <DialogDescription>Só o nome é obrigatório.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sup-name">Nome</Label>
              <Input id="sup-name" value={form.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sup-doc">CPF/CNPJ</Label>
              <Input id="sup-doc" value={form.document} maxLength={30} inputMode="numeric" onChange={(e) => set({ document: e.target.value })} placeholder="Só números" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sup-phone">Telefone</Label>
              <Input id="sup-phone" value={form.phone} maxLength={40} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sup-email">E-mail</Label>
              <Input id="sup-email" type="email" value={form.email} maxLength={160} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sup-address">Endereço</Label>
              <Input id="sup-address" value={form.address} maxLength={300} onChange={(e) => set({ address: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sup-notes">Observações</Label>
              <Textarea id="sup-notes" value={form.notes} maxLength={2000} rows={3} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ficha */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{d?.supplier.name ?? "Fornecedor"}</DialogTitle>
            <DialogDescription>
              {d ? [formatDocument(d.supplier.document), d.supplier.phone, d.supplier.email].filter(Boolean).join(" · ") || "Sem dados de contato" : "Carregando…"}
            </DialogDescription>
          </DialogHeader>
          {!d ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : (
            <div className="space-y-4" data-testid="supplier-detail">
              {d.supplier.address && <p className="text-sm text-muted-foreground">{d.supplier.address}</p>}
              {d.supplier.notes && <p className="text-sm">{d.supplier.notes}</p>}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Aparelhos comprados</p>
                  <p className="text-lg font-semibold" data-testid="supplier-device-count">{d.deviceCount}</p>
                </div>
                {showTotals && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Total comprado (custo)</p>
                    <p className="text-lg font-semibold" data-testid="supplier-total">{fmt(d.totalPurchased ?? 0)}</p>
                  </div>
                )}
                {d.payablesOpen !== undefined && (
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Contas a pagar em aberto</p>
                    <p className="text-lg font-semibold">{fmt(d.payablesOpen)}</p>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Aparelhos comprados</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aparelho</TableHead>
                        <TableHead>Serial/IMEI</TableHead>
                        <TableHead>Entrada</TableHead>
                        <TableHead>Status</TableHead>
                        {showTotals && <TableHead className="text-right">Custo</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.devices.map((dv) => (
                        <TableRow key={dv.id}>
                          <TableCell className="text-sm">{`${dv.model} ${dv.capacity} ${dv.color}`.trim()} <span className="text-xs text-muted-foreground">({dv.condition})</span></TableCell>
                          <TableCell className="font-mono text-xs">{dv.serialImei || "—"}</TableCell>
                          <TableCell className="text-xs">{fmtDay(dv.entryDate ?? dv.createdAt)}</TableCell>
                          <TableCell className="text-xs">{dv.status}</TableCell>
                          {showTotals && <TableCell className="text-right text-sm">{dv.cost !== undefined ? fmt(Number(dv.cost)) : "—"}</TableCell>}
                        </TableRow>
                      ))}
                      {d.devices.length === 0 && (
                        <TableRow><TableCell colSpan={showTotals ? 5 : 4} className="py-4 text-center text-sm text-muted-foreground">Nenhum aparelho ligado a este fornecedor.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {d.payablesOpen !== undefined && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Contas a pagar</h3>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Situação</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {d.payables.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm">{p.description}</TableCell>
                            <TableCell className="text-xs">{fmtDay(p.dueDate)}</TableCell>
                            <TableCell className="text-xs">{p.status}</TableCell>
                            <TableCell className="text-right text-sm">{fmt(Number(p.amount))}</TableCell>
                          </TableRow>
                        ))}
                        {d.payables.length === 0 && (
                          <TableRow><TableCell colSpan={4} className="py-4 text-center text-sm text-muted-foreground">Nenhuma conta a pagar ligada.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>“{deleteTarget?.name}” será removido do cadastro. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bloqueado: tem aparelhos/contas ligados -> oferece inativar */}
      <AlertDialog open={!!blockedTarget} onOpenChange={(o) => !o && setBlockedTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Não é possível excluir</AlertDialogTitle>
            <AlertDialogDescription>{blockedMsg} Você pode inativá-lo: ele some das listas de seleção, mas o histórico de compras continua.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
            {canManage && blockedTarget?.active && (
              <AlertDialogAction
                onClick={async () => {
                  const s = blockedTarget;
                  setBlockedTarget(null);
                  if (s) await toggleActive(s);
                }}
              >
                Inativar fornecedor
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
