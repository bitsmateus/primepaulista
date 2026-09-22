import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, KeyRound, Loader2, Volume2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  loadPrefs, nativeNotificationsSupported, playBeep, savePrefs, type NotificationPrefs,
} from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

// "Minha conta": alterar a própria senha e preferências de notificação (por usuário, neste navegador)
export function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>({ enabled: true, sound: true });
  const [permission, setPermission] = useState<string>(
    nativeNotificationsSupported() ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    if (open && user) {
      setPrefs(loadPrefs(user.id));
      setCurrent(""); setNext(""); setConfirm(""); setError("");
      if (nativeNotificationsSupported()) setPermission(Notification.permission);
    }
  }, [open, user]);

  if (!user) return null;

  const updatePrefs = (patch: Partial<NotificationPrefs>) => {
    const v = { ...prefs, ...patch };
    setPrefs(v);
    savePrefs(user.id, v);
  };

  const askPermission = async () => {
    if (!nativeNotificationsSupported()) return;
    try {
      const res = await Notification.requestPermission();
      setPermission(res);
      if (res === "granted") toast.success("Notificações do navegador liberadas.");
      else toast.error("O navegador não liberou as notificações.");
    } catch {
      toast.error("Não foi possível pedir permissão ao navegador.");
    }
  };

  const changePassword = async () => {
    setError("");
    if (next.length < 6) return setError("A nova senha deve ter ao menos 6 caracteres.");
    if (next !== confirm) return setError("A confirmação da nova senha não confere.");
    setBusy(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next, confirmPassword: confirm });
      toast.success("Senha alterada com sucesso.");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível alterar a senha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Minha conta</DialogTitle>
          <DialogDescription>
            {user.name} · {user.email} · {ROLE_LABELS[user.role] ?? user.role}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3" aria-label="Alterar senha">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" /> Alterar senha</h3>
          <div className="space-y-1">
            <Label htmlFor="acc-current">Senha atual</Label>
            <Input id="acc-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-new">Nova senha</Label>
            <Input id="acc-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="mín. 6 caracteres" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-confirm">Confirmar nova senha</Label>
            <Input id="acc-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button onClick={changePassword} disabled={busy || !current || !next || !confirm} className="w-full">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Alterar senha
          </Button>
        </section>

        <Separator />

        <section className="space-y-3" aria-label="Notificações">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4" /> Notificações</h3>
          <p className="text-xs text-muted-foreground">
            Avisos de OS prontas sem aviso, tarefas de leads, orçamentos que vencem hoje, estoque baixo e aparelhos parados.
            Só avisa quando um número aumenta. Vale para este usuário neste navegador.
          </p>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="notif-enabled">Receber avisos</Label>
            <Switch id="notif-enabled" aria-label="Receber avisos" checked={prefs.enabled} onCheckedChange={(v) => updatePrefs({ enabled: v })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="notif-sound" className="flex items-center gap-2"><Volume2 className="h-4 w-4" /> Som de alerta</Label>
            <Switch
              id="notif-sound"
              aria-label="Som de alerta"
              checked={prefs.sound}
              onCheckedChange={(v) => {
                updatePrefs({ sound: v });
                if (v) playBeep();
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground" data-testid="notif-permission">
              Notificações do navegador:{" "}
              {permission === "granted" ? "liberadas" : permission === "denied" ? "bloqueadas no navegador" : permission === "unsupported" ? "não suportadas" : "ainda não liberadas"}
            </span>
            <Button variant="outline" size="sm" onClick={askPermission} disabled={permission === "granted" || permission === "unsupported"}>
              Permitir notificações do navegador
            </Button>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
