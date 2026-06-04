import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { ExpenseCategory } from "@/types/financial";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(211, 80%, 60%)",
  "hsl(280, 60%, 55%)",
  "hsl(160, 50%, 50%)",
];

const categories: ExpenseCategory[] = ["Aluguel", "Condomínio", "Impostos (MEI)", "Tráfego Pago", "Salários", "Pro-labore", "Outros"];

interface Props {
  financial: any;
}

export function ExpensesTab({ financial }: Props) {
  const { expenses, addExpense, deleteExpense, expenseDistribution, totalExpenses, grossRevenue } = financial;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Outros");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(false);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleAdd = () => {
    if (!desc || !amount) return;
    addExpense({ description: desc, category, amount: parseFloat(amount), date: new Date(), recurring });
    setDesc(""); setAmount(""); setDialogOpen(false);
  };

  const expenseRatio = grossRevenue > 0 ? ((totalExpenses / grossRevenue) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Total Despesas / Faturamento</p>
          <p className="text-2xl font-semibold text-foreground">{fmt(totalExpenses)} <span className="text-sm text-muted-foreground">({expenseRatio}%)</span></p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nova Despesa</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar Despesa</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Descrição</Label><Input value={desc} onChange={e => setDesc(e.target.value)} /></div>
              <div>
                <Label>Categoria</Label>
                <Select value={category} onValueChange={v => setCategory(v as ExpenseCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Valor (R$)</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={recurring} onCheckedChange={setRecurring} />
                <Label>Despesa recorrente</Label>
              </div>
              <Button onClick={handleAdd} className="w-full">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart */}
        <Card className="border shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base">Distribuição de Despesas</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={Object.fromEntries(expenseDistribution.map((e: any, i: number) => [e.name, { label: e.name, color: COLORS[i % COLORS.length] }]))} className="h-[300px]">
              <PieChart>
                <Pie data={expenseDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {expenseDistribution.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* List */}
        <Card className="border shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base">Despesas Cadastradas</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {expenses.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{e.description}</p>
                    <p className="text-xs text-muted-foreground">{e.category}{e.recurring ? " · Recorrente" : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{fmt(e.amount)}</p>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteExpense(e.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
