import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Check, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  pendente: "secondary",
  pago: "default",
  atrasado: "destructive",
};

export function ReceivablesTab() {
  const qc = useQueryClient();
  const { customers } = useInventoryContext();
  const { data: receivables = [] } = useQuery({
    queryKey: ["receivables"],
    queryFn: api.listReceivables,
  });

  const [amount, setAmount] = useState("");
  const [customerId, setCustomerId] = useState<string>("none");
  const [dueDate, setDueDate] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["receivables"] });
  const addMut = useMutation({
    mutationFn: () =>
      api.createReceivable({
        amount: parseFloat(amount) || 0,
        customerId: customerId !== "none" ? customerId : undefined,
        // ancora ao meio-dia local para não "voltar" um dia por fuso horário
        dueDate: dueDate ? new Date(dueDate + "T12:00:00").toISOString() : undefined,
      }),
    onSuccess: () => {
      invalidate();
      setAmount(""); setCustomerId("none"); setDueDate("");
      toast.success("Conta a receber adicionada!");
    },
  });
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "pendente" | "pago" }) =>
      api.updateReceivableStatus(id, status),
    onSuccess: invalidate,
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.deleteReceivable(id),
    onSuccess: invalidate,
  });

  const customerName = (id: string | null) =>
    customers.find((c) => c.id === id)?.name ?? "—";

  const now = new Date();
  const effectiveStatus = (r: { status: string; dueDate: Date | null }) =>
    r.status !== "pago" && r.dueDate && new Date(r.dueDate).getTime() < now.getTime() ? "atrasado" : r.status;

  const totalPending = receivables
    .filter((r) => r.status !== "pago")
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-5">
          <p className="text-sm text-muted-foreground">Total pendente a receber</p>
          <p className="text-3xl font-bold text-orange-600">{fmt(totalPending)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nova conta a receber</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Cliente (opcional)</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cliente</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => addMut.mutate()} disabled={addMut.isPending || !amount} className="w-full gap-1">
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contas a receber</CardTitle>
        </CardHeader>
        <CardContent>
          {receivables.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta a receber registrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivables.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{customerName(r.customerId)}</TableCell>
                    <TableCell>{fmt(r.amount)}</TableCell>
                    <TableCell>{r.dueDate ? r.dueDate.toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[effectiveStatus(r)]}>{effectiveStatus(r)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status !== "pago" && (
                        <Button size="icon" variant="ghost" className="h-8 w-8"
                          title="Marcar como pago"
                          onClick={() => statusMut.mutate({ id: r.id, status: "pago" })}>
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8"
                        onClick={() => delMut.mutate(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
