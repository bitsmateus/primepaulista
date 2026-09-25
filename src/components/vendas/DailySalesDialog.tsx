import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Device, Sale } from "@/types/inventory";
import { buildDailySalesReport, METHOD_LABEL, toYmd } from "@/lib/dailySales";
import { printDailySales } from "@/utils/dailySalesPrint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sales: Sale[];
  devices: Device[];
  userName?: string;
}

// Escolhe o dia (hoje por padrão), mostra o resumo do caixa e imprime o relatório completo.
export function DailySalesDialog({ open, onOpenChange, sales, devices, userName }: Props) {
  const [date, setDate] = useState(() => toYmd(new Date()));
  const report = useMemo(() => buildDailySalesReport(sales, devices, date), [sales, devices, date]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Relatório de vendas do dia</DialogTitle>
          <DialogDescription>
            Todas as vendas do dia com valores, forma de recebimento e o aparelho identificado pelo número de série.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="daily-date">Dia</Label>
          <Input
            id="daily-date"
            type="date"
            value={date}
            max={toYmd(new Date())}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </div>

        <div className="space-y-2 rounded-lg border p-3 text-sm" data-testid="daily-summary">
          <div className="flex justify-between"><span className="text-muted-foreground">Vendas</span><span className="font-semibold">{report.count}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Valor vendido</span><span className="font-semibold">{fmt(report.totalSaleValue)}</span></div>
          <div className="border-t pt-2">
            {report.byMethod.map((m) => (
              <div key={m.method} className={`flex justify-between ${m.amount === 0 ? "text-muted-foreground" : ""}`}>
                <span>{METHOD_LABEL[m.method] ?? m.method}</span>
                <span>{fmt(m.amount)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold"><span>Total recebido</span><span>{fmt(report.totalReceived)}</span></div>
          {report.returned.length > 0 && (
            <p className="text-xs text-muted-foreground">{report.returned.length} venda(s) devolvida(s) neste dia não entram nos totais.</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button className="gap-2" onClick={() => printDailySales(report, userName)}>
            <Printer className="h-4 w-4" /> Imprimir relatório
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
