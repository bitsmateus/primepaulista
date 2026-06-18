import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Check, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const CATEGORIES = ["Fornecedor", "Aluguel", "Impostos", "Salários", "Energia/Água", "Internet/Telefone", "Outros"];
const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  pendente: "secondary", pago: "default", atrasado: "destructive",
};

export function PayablesTab() {
  const qc = useQueryClient();
  const { data: payables = [] } = useQuery({ queryKey: ["payables"], queryFn: api.listPayables });

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Fornecedor");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurring, setRecurring] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["payables"] });
  const addMut = useMutation({
    mutationFn: () =>
      api.createPayable({
        description, category,
        amount: parseFloat(amount) || 0,
        dueDate: dueDate ? new Date(dueDate + "T12:00:00").toISOString() : undefined,
        recurring,
      }),
    onSuccess: () => {
      invalidate();
      setDescription(""); setCategory("Fornecedor"); setAmount(""); setDueDate(""); setRecurring(false);
      toast.success("Conta a pagar adicionada!");
    },
    onError: () => toast.error("Falha ao adicionar conta."),
  });
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "pendente" | "pago" }) => api.updatePayableStatus(id, status),
    onSuccess: invalidate,
    onError: () => toast.error("Falha ao atualizar a conta."),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.deletePayable(id),
    onSuccess: invalidate,
    onError: () => toast.error("Falha ao excluir a conta."),
  });

  const now = new Date();
  const isOverdue = (d: Date | null, status: string) => !!d && status !== "pago" && d.getTime() < now.getTime();
  const totalPending = payables.filter((p) => p.status !== "pago").reduce((s, p) => s + p.amount, 0);
  const totalOverdue = payables.filter((p) => isOverdue(p.dueDate, p.status)).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-muted-foreground">Total pendente a pagar</p>
            <p className="text-3xl font-bold text-orange-600">{fmt(totalPending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-muted-foreground">Vencidas (em atraso)</p>
            <p className="text-3xl font-bold text-destructive">{fmt(totalOverdue)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Nova conta a pagar</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <Label>Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Fornecedor X — nota 123" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={recurring} onCheckedChange={(v) => setRecurring(!!v)} /> Conta recorrente (mensal)
            </label>
            <Button onClick={() => addMut.mutate()} disabled={addMut.isPending || !description.trim() || !amount} className="gap-1">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Contas a pagar</CardTitle></CardHeader>
        <CardContent>
          {payables.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta a pagar registrada.</p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payables.map((p) => {
                  const overdue = isOverdue(p.dueDate, p.status);
                  const status = overdue ? "atrasado" : p.status;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.description}{p.recurring ? " · 🔁" : ""}</TableCell>
                      <TableCell className="text-muted-foreground">{p.category || "—"}</TableCell>
                      <TableCell>{fmt(p.amount)}</TableCell>
                      <TableCell className={overdue ? "text-destructive font-medium" : ""}>
                        {p.dueDate ? p.dueDate.toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell><Badge variant={statusVariant[status]}>{status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {p.status !== "pago" && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Marcar como paga"
                            onClick={() => statusMut.mutate({ id: p.id, status: "pago" })}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => delMut.mutate(p.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
