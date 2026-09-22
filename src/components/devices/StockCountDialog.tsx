import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, RotateCcw, ScanLine, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Device } from "@/types/inventory";
import { api, ApiError } from "@/lib/api";
import { allLocations, findDeviceByCode, stockCountProgress } from "@/lib/deviceView";
import { downloadCsv } from "@/lib/download";
import { formatCapacity } from "@/lib/utils";
import { BarcodeScannerDialog } from "@/components/devices/BarcodeScannerDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: Device[];
  showCost: boolean;
}

type Feedback = { kind: "ok" | "warn" | "error"; text: string } | null;

const MISSING_LIMIT = 100;

export function StockCountDialog({ open, onOpenChange, devices, showCost }: Props) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("all");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [scanning, setScanning] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // Conferidos nesta sessão, para o contador subir na hora (sem esperar o recarregamento)
  const [localChecked, setLocalChecked] = useState<Set<string>>(new Set());

  const effective = useMemo(
    () => devices.map((d) => (localChecked.has(d.id) && !d.checkedAt ? { ...d, checkedAt: new Date() } : d)),
    [devices, localChecked]
  );
  const progress = useMemo(() => stockCountProgress(effective, location), [effective, location]);
  const pct = progress.total ? Math.round((progress.checked / progress.total) * 100) : 0;

  const handleCode = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const device = findDeviceByCode(effective, value);
    if (!device) {
      setFeedback({ kind: "error", text: `"${value}" não encontrado no estoque.` });
      return;
    }
    const name = `${device.model} ${formatCapacity(device.capacity)} ${device.color}`.trim();
    if (device.checkedAt) {
      setFeedback({ kind: "warn", text: `${name} já foi conferido.` });
      return;
    }
    if (location !== "all" && (device.location || "Estoque") !== location) {
      setFeedback({ kind: "warn", text: `${name} conferido, mas está em "${device.location}" (filtro: "${location}").` });
    } else {
      setFeedback({ kind: "ok", text: `${name} conferido.` });
    }
    setLocalChecked((prev) => new Set(prev).add(device.id));
    try {
      await api.stockCheck([device.id]);
      qc.invalidateQueries({ queryKey: ["devices"] });
    } catch (err) {
      setLocalChecked((prev) => { const n = new Set(prev); n.delete(device.id); return n; });
      setFeedback({ kind: "error", text: err instanceof ApiError ? err.message : "Falha ao registrar a conferência." });
    }
  };

  const submit = () => {
    void handleCode(code);
    setCode("");
  };

  const reset = async () => {
    try {
      const r = await api.stockCheckReset();
      setLocalChecked(new Set());
      setFeedback(null);
      await qc.invalidateQueries({ queryKey: ["devices"] });
      toast.success(`Novo balanço iniciado (${r.cleared} conferência(s) limpas).`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível iniciar um novo balanço.");
    }
  };

  const exportMissing = () =>
    downloadCsv(
      `balanco-faltantes-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Modelo", "Capacidade", "Cor", "Condição", "IMEI 1", "Serial", "Local", "Status"],
      progress.missing.map((d) => [
        d.model, d.capacity, d.color, d.condition, d.serialImei, d.serial || d.internalSerial, d.location, d.status,
      ])
    );

  const fbClass =
    feedback?.kind === "ok" ? "border-success/40 bg-success/10 text-success"
    : feedback?.kind === "warn" ? "border-warning/40 bg-warning/10 text-warning"
    : "border-destructive/40 bg-destructive/10 text-destructive";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Balanço de estoque</DialogTitle>
            <DialogDescription>
              Leia o IMEI ou serial de cada aparelho físico (câmera ou leitor de código de barras). O que
              não for conferido aparece na lista de faltantes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os locais</SelectItem>
                  {allLocations(devices).map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="ml-auto text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{progress.checked}</span> de {progress.total} conferidos ({pct}%)
              </div>
            </div>
            <Progress value={pct} />

            <div className="flex gap-2">
              <Input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
                placeholder="Leia ou digite o IMEI / serial e tecle Enter"
                className="h-11 text-base"
                data-testid="stock-count-input"
              />
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => setScanning(true)}>
                <ScanLine className="h-4 w-4" /> Câmera
              </Button>
              <Button type="button" className="h-11" onClick={submit}>Conferir</Button>
            </div>

            {feedback && (
              <div className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${fbClass}`} role="status">
                {feedback.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {feedback.text}
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Faltam conferir ({progress.missing.length})</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={exportMissing} disabled={progress.missing.length === 0}>
                  <Download className="h-4 w-4" /> Baixar faltantes
                </Button>
                {showCost && (
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setConfirmReset(true)}>
                    <RotateCcw className="h-4 w-4" /> Novo balanço
                  </Button>
                )}
              </div>
            </div>

            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Cap.</TableHead>
                    <TableHead>Cor</TableHead>
                    <TableHead>IMEI / Serial</TableHead>
                    <TableHead>Local</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progress.missing.slice(0, MISSING_LIMIT).map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.model}</TableCell>
                      <TableCell>{formatCapacity(d.capacity)}</TableCell>
                      <TableCell>{d.color}</TableCell>
                      <TableCell className="font-mono text-xs">{d.serialImei || d.serial || d.internalSerial}</TableCell>
                      <TableCell>{d.location}</TableCell>
                    </TableRow>
                  ))}
                  {progress.missing.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        {progress.total === 0 ? "Nenhum aparelho neste local." : "Tudo conferido! 🎉"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {progress.missing.length > MISSING_LIMIT && (
              <p className="text-xs text-muted-foreground">
                Mostrando {MISSING_LIMIT} de {progress.missing.length}. "Baixar faltantes" traz a lista completa.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BarcodeScannerDialog
        open={scanning}
        onOpenChange={setScanning}
        onDetected={(c) => void handleCode(c)}
        continuous
        title="Escanear para conferir"
        description="Mantenha a câmera aberta e passe de aparelho em aparelho."
      />

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar um novo balanço?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as conferências atuais serão apagadas e todos os aparelhos voltam a "não conferido".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void reset()}>Iniciar novo balanço</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
