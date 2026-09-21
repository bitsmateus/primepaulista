import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, Upload } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { extractSettingsFromBackup } from "@/lib/backup";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Backup (só administrador): exporta os dados em JSON (sem senhas nem valores de variáveis) e
// restaura SOMENTE as configurações da loja. Dados de negócio não são restaurados por aqui.
export function BackupTab() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pending, setPending] = useState<{ name: string; settings: Record<string, unknown> } | null>(null);
  const [result, setResult] = useState<{ restored: string[]; ignored: string[]; invalid: { key: string; error: string }[] } | null>(null);

  const exportBackup = async () => {
    setExporting(true);
    try {
      const blob = await api.exportBackup();
      downloadBlob(blob, `backup-prime-paulista-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success("Backup exportado.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível exportar o backup.");
    } finally {
      setExporting(false);
    }
  };

  const onFile = async (file?: File) => {
    setResult(null);
    if (!file) return;
    try {
      const settings = extractSettingsFromBackup(JSON.parse(await file.text()));
      if (!settings || Object.keys(settings).length === 0) {
        toast.error("O arquivo não tem configurações para restaurar.");
        setPending(null);
      } else {
        setPending({ name: file.name, settings });
      }
    } catch {
      toast.error("Arquivo inválido: envie um backup .json exportado pelo sistema.");
      setPending(null);
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const restore = async () => {
    if (!pending) return;
    setRestoring(true);
    try {
      const res = await api.restoreSettings(pending.settings);
      setResult(res);
      setPending(null);
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["settingsBundle"] });
      toast.success(`${res.restored.length} configuração(ões) restaurada(s).`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível restaurar.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border shadow-none">
        <CardContent className="space-y-3 p-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">Exportar backup</h2>
            <p className="text-sm text-muted-foreground">
              Baixa todos os dados do sistema em um arquivo JSON. Não inclui senhas nem os valores das variáveis customizadas. A exportação fica na auditoria.
            </p>
          </div>
          <Button onClick={exportBackup} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar backup (JSON)
          </Button>
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardContent className="space-y-3 p-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">Restaurar configurações</h2>
            <p className="text-sm text-muted-foreground">
              Importa somente as <strong>configurações</strong> (dados da loja, logo, termos de garantia, mensagens de OS, segurança) de um backup. Vendas, estoque, clientes e demais dados
              <strong> não</strong> são restaurados por aqui.
            </p>
          </div>
          <input ref={input} type="file" accept="application/json,.json" className="hidden" aria-label="Escolher arquivo de backup" onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => input.current?.click()} className="gap-2"><Upload className="h-4 w-4" /> Escolher arquivo</Button>
            {pending && (
              <>
                <span className="text-sm text-muted-foreground" data-testid="restore-pending">
                  {pending.name}: {Object.keys(pending.settings).join(", ")}
                </span>
                <Button onClick={restore} disabled={restoring}>
                  {restoring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Restaurar configurações
                </Button>
              </>
            )}
          </div>
          {result && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm" data-testid="restore-result">
              <p>Restauradas: {result.restored.length ? result.restored.join(", ") : "nenhuma"}</p>
              {result.ignored.length > 0 && <p>Ignoradas (não são configurações): {result.ignored.join(", ")}</p>}
              {result.invalid.length > 0 && <p className="text-destructive">Recusadas por dados inválidos: {result.invalid.map((i) => `${i.key} (${i.error})`).join(", ")}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
