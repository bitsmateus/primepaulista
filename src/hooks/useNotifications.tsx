import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  increasedCounts, loadLastCounts, loadPrefs, notificationMessage, playBeep, reminderMessage, saveLastCounts, showNativeNotification,
} from "@/lib/notifications";

// Consulta os contadores a cada 60 s (e ao voltar o foco) e avisa SÓ quando algum AUMENTA em
// relação ao último visto (guardado no localStorage): toast + notificação do navegador + bipe.
// Não notifica na primeira carga nem repete o mesmo total.
export function NotificationsWatcher({ paused = false }: { paused?: boolean }) {
  const { user } = useAuth();
  const userId = user?.id;
  const processed = useRef<unknown>(null);

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["notificationsSummary", userId],
    queryFn: api.notificationsSummary,
    enabled: !!userId && !paused,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!userId || !data) return;
    // cada resposta é processada uma única vez
    const stamp = `${userId}:${dataUpdatedAt}`;
    if (processed.current === stamp) return;
    processed.current = stamp;

    const prefs = loadPrefs(userId);
    // Lembretes de tarefa (Planejamento): já vencidos, entregues uma vez só pelo servidor.
    // Aparecem sempre (mesmo na primeira carga); a notificação nativa e o bipe seguem as preferências.
    if (data.reminders && data.reminders.length > 0) {
      const { title, body } = reminderMessage(data.reminders);
      toast.info(title, { description: body, duration: 15000 });
      if (prefs.enabled) {
        showNativeNotification(title, body);
        if (prefs.sound) playBeep();
      }
    }

    const prev = loadLastCounts(userId);
    const increases = increasedCounts(prev, data.counts);
    saveLastCounts(userId, data.counts);
    if (increases.length === 0) return;
    if (!prefs.enabled) return;
    const { title, body } = notificationMessage(increases);
    toast.info(title, { description: body, duration: 10000 });
    showNativeNotification(title, body);
    if (prefs.sound) playBeep();
  }, [data, dataUpdatedAt, userId]);

  return null;
}
