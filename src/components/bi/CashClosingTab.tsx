import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  financial: any;
}

export function CashClosingTab({ financial }: Props) {
  const { getDailyCash, sangrias, addSangria } = financial;
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [sangriaAmount, setSangriaAmount] = useState("");
  const [sangriaJustification, setSangriaJustification] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const cash = getDailyCash(dateStr);
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleAddSangria = () => {
    if (!sangriaAmount || !sangriaJustification) return;
    addSangria({ amount: parseFloat(sangriaAmount), justification: sangriaJustification, date: selectedDate });
    setSangriaAmount("");
    setSangriaJustification("");
    setDialogOpen(false);
  };

  const daySangrias = sangrias.filter((s: any) => format(s.date, "yyyy-MM-dd") === dateStr);

  return (
    <div className="space-y-6">
      {/* Date selector */}
      <div className="flex items-center gap-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[240px] justify-start text-left font-normal")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Minus className="h-4 w-4" /> Sangria
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Sangria</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Valor</Label>
                <Input type="number" placeholder="0.00" value={sangriaAmount} onChange={e => setSangriaAmount(e.target.value)} />
              </div>
              <div>
                <Label>Justificativa</Label>
                <Textarea placeholder="Motivo da retirada..." value={sangriaJustification} onChange={e => setSangriaJustification(e.target.value)} />
              </div>
              <Button onClick={handleAddSangria} className="w-full">Registrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Payment breakdown */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "PIX", value: cash.pix, color: "text-success" },
          { label: "Dinheiro", value: cash.dinheiro, color: "text-foreground" },
          { label: "Cartão Crédito", value: cash.creditCard, color: "text-primary" },
          { label: "Cartão Débito", value: cash.debitCard, color: "text-primary" },
        ].map(item => (
          <Card key={item.label} className="border shadow-none">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className={`mt-2 text-2xl font-semibold ${item.color}`}>{fmt(item.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border shadow-none">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Sangrias do Dia</p>
            <p className="mt-2 text-2xl font-semibold text-destructive">- {fmt(cash.sangrias)}</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-primary/20 shadow-none bg-primary/5">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total Líquido do Dia</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{fmt(cash.total)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sangria history */}
      {daySangrias.length > 0 && (
        <Card className="border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sangrias Registradas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {daySangrias.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <p className="text-sm text-foreground">{s.justification}</p>
                  <p className="text-sm font-semibold text-destructive">- {fmt(s.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
