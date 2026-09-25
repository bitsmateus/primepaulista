import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Device } from "@/types/inventory";
import { api, ApiError } from "@/lib/api";
import { suggestModelRenames } from "@/lib/modelName";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: Device[];
}

// Mostra os nomes de modelo digitados de forma diferente ("14", "16 PM") e, com a
// confirmação da pessoa, troca pelo nome padrão ("iPhone 14", "iPhone 16 Pro Max").
export function ModelRenameDialog({ open, onOpenChange, devices }: Props) {
  const qc = useQueryClient();
  const suggestions = useMemo(() => suggestModelRenames(devices), [devices]);
  const keyOf = (s: { category: string; from: string; to: string }) => `${s.category}|${s.from}|${s.to}`;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (open) setChecked(new Set(suggestions.map(keyOf)));
  }, [open, suggestions]);

  const selected = suggestions.filter((s) => checked.has(keyOf(s)));
  const totalDevices = selected.reduce((sum, s) => sum + s.count, 0);

  const toggle = (k: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  const apply = async () => {
    setApplying(true);
    let updated = 0;
    try {
      for (const s of selected) {
        const r = await api.renameDeviceModel(s.category, s.from, s.to);
        updated += r.updated;
      }
      await qc.invalidateQueries({ queryKey: ["devices"] });
      toast.success(`${updated} aparelho(s) com o nome do modelo padronizado.`);
      onOpenChange(false);
    } catch (err) {
      await qc.invalidateQueries({ queryKey: ["devices"] });
      toast.error(err instanceof ApiError ? err.message : "Não foi possível padronizar os nomes.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Padronizar nomes de modelos</DialogTitle>
          <DialogDescription>
            Aparelhos do mesmo modelo cadastrados com nomes diferentes (ex.: <strong>14</strong> e{" "}
            <strong>iPhone 14</strong>) ficam separados na lista. Marque o que deve ser corrigido.
          </DialogDescription>
        </DialogHeader>

        {suggestions.length === 0 ? (
          <p className="rounded-lg bg-muted/50 py-6 text-center text-sm text-muted-foreground" data-testid="rename-empty">
            Todos os nomes de modelo já estão padronizados.
          </p>
        ) : (
          <div className="max-h-80 divide-y overflow-auto rounded-lg border" data-testid="rename-list">
            {suggestions.map((s) => {
              const k = keyOf(s);
              return (
                <label key={k} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                  <Checkbox checked={checked.has(k)} onCheckedChange={() => toggle(k)} aria-label={`Corrigir ${s.from}`} />
                  <span className="flex-1">
                    <span className="text-muted-foreground line-through">{s.from}</span>
                    {" → "}
                    <span className="font-medium">{s.to}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{s.count} aparelho(s)</span>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={apply} disabled={applying || selected.length === 0}>
            {applying ? "Aplicando..." : `Padronizar ${totalDevices} aparelho(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
