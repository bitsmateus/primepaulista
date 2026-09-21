import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { DEFAULT_SECURITY, useSaveSetting, useSetting, type SecuritySettings } from "@/hooks/useAppSettings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Segurança: bloqueio automático de tela por inatividade (vale para todos os usuários)
export function SecurityTab() {
  const { data } = useSetting<SecuritySettings>("security");
  const save = useSaveSetting<SecuritySettings>("security", "Segurança salva.");
  const [minutes, setMinutes] = useState(String(DEFAULT_SECURITY.autoLockMinutes));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !dirty) setMinutes(String(data.autoLockMinutes));
  }, [data, dirty]);

  const n = Number(minutes);
  const invalid = minutes === "" || !Number.isInteger(n) || n < 0 || n > 1440;

  return (
    <Card className="border shadow-none">
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Segurança</h2>
          <p className="text-sm text-muted-foreground">
            Bloqueio automático da tela após um tempo sem uso. A pessoa desbloqueia com a própria senha.
            Use 0 para desligar. Também dá para bloquear na hora pelo botão “Bloquear tela” do menu (atalho Alt+L).
          </p>
        </div>
        <div className="max-w-xs space-y-1">
          <Label htmlFor="auto-lock">Bloquear após (minutos sem uso)</Label>
          <Input id="auto-lock" type="number" min={0} max={1440} value={minutes} onChange={(e) => { setMinutes(e.target.value); setDirty(true); }} />
          {invalid && <p className="text-xs text-destructive">Informe um número inteiro de 0 a 1440.</p>}
        </div>
        <Button onClick={() => save.mutate({ autoLockMinutes: n }, { onSuccess: () => setDirty(false) })} disabled={save.isPending || invalid || !dirty}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
