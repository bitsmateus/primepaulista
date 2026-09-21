import type { NotificationCounts, TaskReminderNotice } from "@/lib/api";

// Regras puras das notificações do navegador (o hook só cuida de buscar e exibir).

export type CountKey = Exclude<keyof NotificationCounts, "taskReminders">; // lembretes de tarefa chegam a parte
export const COUNT_KEYS: CountKey[] = ["osReady", "tasksDue", "quotesToday", "lowStock", "staleDevices", "newMessages"];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const NOTIFICATION_TEXT: Record<CountKey, (n: number) => string> = {
  osReady: (n) => `${plural(n, "OS pronta", "OS prontas")} para retirada sem aviso ao cliente`,
  tasksDue: (n) => `${plural(n, "tarefa", "tarefas")} de lead vencida(s) ou para hoje`,
  quotesToday: (n) => `${plural(n, "orçamento vence", "orçamentos vencem")} hoje`,
  lowStock: (n) => `${plural(n, "acessório", "acessórios")} com estoque baixo`,
  staleDevices: (n) => `${plural(n, "aparelho parado", "aparelhos parados")} há mais de 30 dias`,
  newMessages: (n) => `${plural(n, "mensagem nova", "mensagens novas")} no WhatsApp (CRM)`,
};

// Lembretes de tarefa já vencidos (não fazem parte dos contadores: chegam uma vez só)
export function reminderMessage(reminders: TaskReminderNotice[]): { title: string; body: string } {
  return {
    title: reminders.length === 1 ? "Lembrete de tarefa" : `${reminders.length} lembretes de tarefa`,
    body: reminders.map((r) => `${r.title} (${r.dayLabel})`).join("\n"),
  };
}

export interface CountIncrease {
  key: CountKey;
  from: number;
  to: number;
}

// Só devolve o que AUMENTOU em relação ao último visto.
// Sem "último visto" (primeira carga) não notifica nada: apenas serve de base.
export function increasedCounts(
  prev: Partial<NotificationCounts> | null,
  next: Partial<NotificationCounts>
): CountIncrease[] {
  if (!prev) return [];
  const out: CountIncrease[] = [];
  for (const key of COUNT_KEYS) {
    const to = next[key] ?? 0;
    const from = prev[key] ?? 0;
    if (to > from) out.push({ key, from, to });
  }
  return out;
}

export function notificationMessage(increases: CountIncrease[]): { title: string; body: string } {
  const lines = increases.map((i) => NOTIFICATION_TEXT[i.key](i.to));
  return {
    title: increases.length === 1 ? "Novo aviso" : `${increases.length} novos avisos`,
    body: lines.join("\n"),
  };
}

// ---- Preferências por usuário (localStorage) ----
export interface NotificationPrefs {
  enabled: boolean; // avisos (toast + notificação do navegador)
  sound: boolean; // bipe
}
export const DEFAULT_PREFS: NotificationPrefs = { enabled: true, sound: true };

const prefsKey = (userId: string) => `pp_notif_prefs_${userId}`;
const lastKey = (userId: string) => `pp_notif_last_${userId}`;

export function loadPrefs(userId: string): NotificationPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(userId));
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<NotificationPrefs>;
    return { enabled: p.enabled !== false, sound: p.sound !== false };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
export function savePrefs(userId: string, prefs: NotificationPrefs) {
  try {
    localStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
  } catch {
    /* sem armazenamento: segue sem persistir */
  }
}

export function loadLastCounts(userId: string): Partial<NotificationCounts> | null {
  try {
    const raw = localStorage.getItem(lastKey(userId));
    return raw ? (JSON.parse(raw) as Partial<NotificationCounts>) : null;
  } catch {
    return null;
  }
}
export function saveLastCounts(userId: string, counts: Partial<NotificationCounts>) {
  try {
    localStorage.setItem(lastKey(userId), JSON.stringify(counts));
  } catch {
    /* ignora */
  }
}

// Bipe curto (Web Audio, sem arquivo). Nunca lança: navegadores podem bloquear áudio sem interação.
export function playBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.27);
    osc.onended = () => void ctx.close();
  } catch {
    /* ignora */
  }
}

export function nativeNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function showNativeNotification(title: string, body: string) {
  try {
    if (nativeNotificationsSupported() && Notification.permission === "granted") {
      new Notification(title, { body, tag: "pp-avisos" });
    }
  } catch {
    /* ignora */
  }
}
