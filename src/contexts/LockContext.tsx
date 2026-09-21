import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode, FormEvent } from "react";
import { Loader2, Lock } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useSecurity, useStoreSnapshot, useLogoSrc } from "@/hooks/useAppSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Bloqueio de tela: overlay de tela cheia que sobrevive a recarregar a página (sessionStorage),
// bloqueia toda interação com o sistema e só libera com a senha do usuário (POST /auth/verify-password,
// que não emite token novo). "Sair" continua funcionando. Bloqueio automático por inatividade
// (Configurações > Segurança; 0 = desligado).
const LOCK_KEY = "pp_locked_user";

interface LockContextType {
  locked: boolean;
  lock: () => void;
}
const LockContext = createContext<LockContextType | null>(null);

export function useLock() {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error("useLock deve ser usado dentro de LockProvider");
  return ctx;
}

const readLock = () => {
  try {
    return sessionStorage.getItem(LOCK_KEY);
  } catch {
    return null;
  }
};
const writeLock = (userId: string | null) => {
  try {
    if (userId) sessionStorage.setItem(LOCK_KEY, userId);
    else sessionStorage.removeItem(LOCK_KEY);
  } catch {
    /* sem sessionStorage: o bloqueio vale só até recarregar */
  }
};

export function LockProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { autoLockMinutes } = useSecurity();
  const [lockedFor, setLockedFor] = useState<string | null>(() => readLock());
  const locked = !!user && lockedFor === user.id;
  const content = useRef<HTMLDivElement>(null);
  const lastActivity = useRef(Date.now());

  const lock = useCallback(() => {
    if (!user) return;
    // fecha diálogos abertos (o foco preso de um diálogo atrapalharia o campo de senha)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    writeLock(user.id);
    setLockedFor(user.id);
  }, [user]);

  const unlock = useCallback(() => {
    writeLock(null);
    setLockedFor(null);
    lastActivity.current = Date.now();
  }, []);

  // Sair (ou trocar de usuário) limpa o bloqueio guardado
  useEffect(() => {
    if (loading) return; // ao recarregar, espera saber quem é o usuário antes de decidir
    if (!user && lockedFor) {
      writeLock(null);
      setLockedFor(null);
    } else if (user && lockedFor && lockedFor !== user.id) {
      writeLock(null);
      setLockedFor(null);
    }
  }, [user, lockedFor, loading]);

  // Conteúdo atrás do overlay fica inerte (sem foco, clique ou leitor de tela)
  useEffect(() => {
    content.current?.toggleAttribute("inert", locked);
  }, [locked]);

  // Atalho: Alt+L
  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, lock]);

  // Inatividade
  useEffect(() => {
    if (!user || locked || !(autoLockMinutes > 0)) return;
    lastActivity.current = Date.now();
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll"] as const;
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true, capture: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= autoLockMinutes * 60_000) lock();
    }, 5_000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bump, { capture: true }));
      window.clearInterval(timer);
    };
  }, [user, locked, autoLockMinutes, lock]);

  return (
    <LockContext.Provider value={{ locked, lock }}>
      <div ref={content}>{children}</div>
      {locked && user && <LockScreen name={user.name} onUnlock={unlock} />}
    </LockContext.Provider>
  );
}

function LockScreen({ name, onUnlock }: { name: string; onUnlock: () => void }) {
  const { logout } = useAuth();
  const store = useStoreSnapshot();
  const logo = useLogoSrc();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.verifyPassword(password);
      setPassword("");
      onUnlock();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível verificar a senha.");
      setPassword("");
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tela bloqueada"
      data-testid="lock-screen"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/95 p-4 backdrop-blur-md"
    >
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 text-center shadow-lg">
        <img src={logo} alt={store.name} className="mx-auto h-14 w-14 rounded-full object-cover" />
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span className="text-sm">Tela bloqueada</span>
        </div>
        <p className="text-lg font-semibold text-foreground" data-testid="lock-user">{name}</p>
        <div className="space-y-1 text-left">
          <Label htmlFor="lock-password">Senha</Label>
          <Input
            id="lock-password"
            ref={input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Digite sua senha para desbloquear"
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={!password || busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Desbloquear
        </Button>
        <button type="button" onClick={logout} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          Sair
        </button>
      </form>
    </div>
  );
}
