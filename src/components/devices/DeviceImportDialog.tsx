import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Device } from "@/types/inventory";
import { api, ApiError } from "@/lib/api";
import {
  DEVICE_TEMPLATE_EXAMPLE, DEVICE_TEMPLATE_HEADERS, ParsedDeviceCsv,
  parseDevicesCsv, parseDevicesSheet, validateImport,
} from "@/lib/deviceCsv";
import { downloadCsv } from "@/lib/download";
import { newSupplierNames } from "@/lib/suppliers";
import { downloadXlsx, readXlsxRows } from "@/lib/excel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: Device[]; // estoque atual, para detectar duplicidade
}

const PREVIEW_LIMIT = 200;
const CONFIRM_WORD = "APAGAR";

export function DeviceImportDialog({ open, onOpenChange, devices }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedDeviceCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [replaceStock, setReplaceStock] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [importing, setImporting] = useState(false);

  const rows = useMemo(
    () => (parsed ? validateImport(parsed, devices, { ignoreExisting: replaceStock }) : []),
    [parsed, devices, replaceStock]
  );
  const valid = rows.filter((r) => r.valid);
  // Fornecedores do arquivo que ainda não existem no cadastro: serão criados automaticamente
  const { data: knownSuppliers = [] } = useQuery({ queryKey: ["suppliers", "", "all"], queryFn: () => api.listSuppliers(), enabled: open });
  const newSuppliers = useMemo(
    () => newSupplierNames(valid.map((r) => r.device.supplier ?? ""), knownSuppliers),
    [valid, knownSuppliers]
  );
  const invalid = rows.filter((r) => !r.valid);
  const withWarnings = valid.filter((r) => r.warnings.length > 0);
  // Aparelhos que seriam apagados: estoque ativo (não vendido)
  const activeCount = devices.filter((d) => d.status !== "Vendido").length;
  const canImport =
    valid.length > 0 && !importing && (!replaceStock || confirmText.trim().toUpperCase() === CONFIRM_WORD);

  const reset = () => {
    setParsed(null);
    setFileName("");
    setReplaceStock(false);
    setConfirmText("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".xls")) {
        toast.error("Arquivo .xls (Excel antigo) não é suportado. Salve como .xlsx ou CSV e tente de novo.");
        setParsed(null);
        return;
      }
      const result = lower.endsWith(".xlsx")
        ? parseDevicesSheet(await readXlsxRows(file))
        : parseDevicesCsv(await file.text());
      setParsed(result);
      if (result.devices.length === 0 && result.errors.length === 0) {
        toast.error("Nenhum dado legível foi encontrado no arquivo selecionado.");
      }
    } catch {
      setParsed(null);
      toast.error("Falha ao processar o arquivo. Verifique se o formato CSV ou Excel é válido.");
    }
  };

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    try {
      const res = await api.importDevices(valid.map((r) => r.device), replaceStock);
      await qc.invalidateQueries({ queryKey: ["devices"] });
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      const parts = [`${res.created} aparelho(s) importado(s)`];
      if (res.suppliersCreated) parts.push(`${res.suppliersCreated} fornecedor(es) novo(s) cadastrado(s)`);
      if (res.removed) parts.push(`${res.removed} do estoque anterior apagado(s)`);
      if (res.skipped.length) parts.push(`${res.skipped.length} ignorado(s) por duplicidade`);
      toast.success(parts.join(" · "));
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível importar os aparelhos.");
    } finally {
      setImporting(false);
    }
  };

  const templateCsv = () =>
    downloadCsv("modelo-importacao-aparelhos.csv", DEVICE_TEMPLATE_HEADERS, [DEVICE_TEMPLATE_EXAMPLE]);
  const templateXlsx = () =>
    downloadXlsx("modelo-importacao-aparelhos.xlsx", DEVICE_TEMPLATE_HEADERS, [DEVICE_TEMPLATE_EXAMPLE]);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar aparelhos (CSV ou Excel)</DialogTitle>
          <DialogDescription>
            Envie um arquivo <strong>.csv</strong> ou <strong>.xlsx</strong> com cabeçalho. Colunas reconhecidas:
            Categoria, Marca, Modelo, Capacidade, Cor, Condição, Bateria, IMEI 1, IMEI 2, Serial, Fornecedor,
            Custo, Preço de venda, Local, Data de entrada e Observações. Só <strong>Modelo</strong> é obrigatório.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {parsed && newSuppliers.length > 0 && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm" data-testid="import-new-suppliers">
              {newSuppliers.length} fornecedor(es) do arquivo ainda não existe(m) e será(ão) cadastrado(s) automaticamente: {newSuppliers.slice(0, 8).join(", ")}{newSuppliers.length > 8 ? "…" : ""}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={templateXlsx} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Baixar modelo Excel
            </Button>
            <Button variant="outline" size="sm" onClick={templateCsv} className="gap-2">
              <Download className="h-4 w-4" /> Baixar modelo CSV
            </Button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => handleFile(e.target.files?.[0])}
            data-testid="device-import-file"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          />

          {parsed && parsed.errors.length > 0 && (
            <div className="max-h-24 overflow-y-auto rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {parsed.errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          {parsed && rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{fileName}</span>
                <Badge variant="available" className="gap-1"><CheckCircle2 className="h-3 w-3" />{valid.length} válido(s)</Badge>
                {invalid.length > 0 && (
                  <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />{invalid.length} com erro (não serão importados)</Badge>
                )}
                {withWarnings.length > 0 && (
                  <Badge variant="maintenance" className="gap-1"><AlertTriangle className="h-3 w-3" />{withWarnings.length} com aviso</Badge>
                )}
              </div>

              <div className="max-h-72 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Linha</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Cap.</TableHead>
                      <TableHead>Cor</TableHead>
                      <TableHead>Condição</TableHead>
                      <TableHead>IMEI / Serial</TableHead>
                      <TableHead>Custo</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, PREVIEW_LIMIT).map((r) => (
                      <TableRow key={r.rowNumber} className={r.valid ? "" : "bg-destructive/5"}>
                        <TableCell className="text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell className="font-medium">{r.device.brand !== "Apple" ? `${r.device.brand} ` : ""}{r.device.model}</TableCell>
                        <TableCell>{r.device.capacity}</TableCell>
                        <TableCell>{r.device.color}</TableCell>
                        <TableCell>{r.device.condition}</TableCell>
                        <TableCell className="font-mono text-xs">{r.device.serialImei || r.device.serial || "—"}</TableCell>
                        <TableCell>{r.device.cost ? r.device.cost.toLocaleString("pt-BR") : "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.errors.map((e, i) => <p key={i} className="text-destructive">{e}</p>)}
                          {r.warnings.map((w, i) => <p key={i} className="text-warning">{w}</p>)}
                          {r.valid && r.warnings.length === 0 && <span className="text-success">Válido</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {rows.length > PREVIEW_LIMIT && (
                <p className="text-xs text-muted-foreground">
                  Mostrando as primeiras {PREVIEW_LIMIT} linhas de {rows.length}. Todas as válidas serão importadas.
                </p>
              )}

              <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="replace-stock"
                    checked={replaceStock}
                    onCheckedChange={(v) => { setReplaceStock(v === true); setConfirmText(""); }}
                  />
                  <Label htmlFor="replace-stock" className="text-sm leading-snug">
                    Excluir os aparelhos atuais em estoque antes de importar
                    <span className="block text-xs font-normal text-muted-foreground">
                      Apaga {activeCount} aparelho(s) não vendidos e sem histórico de venda. Vendidos são sempre mantidos.
                    </span>
                  </Label>
                </div>
                {replaceStock && (
                  <div className="space-y-1">
                    <Label className="text-xs text-destructive">
                      Ação irreversível. Digite {CONFIRM_WORD} para confirmar:
                    </Label>
                    <Input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={CONFIRM_WORD}
                      className="max-w-xs"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleImport} disabled={!canImport}>
            {importing ? "Importando..." : `Importar ${valid.length} aparelho(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
