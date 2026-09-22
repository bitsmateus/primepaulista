import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, OsNotification } from "@/lib/api";
import { DEFAULT_OS_MESSAGES, OsMessagesSettings } from "@/lib/osMessages";
import { NotificationStatus, OSEvent } from "@/types/serviceOrder";
import { announceNotification } from "@/hooks/useServiceOrders";

// Modelos de mensagem da Assistência (todos leem; só admin grava)
export function useOsMessages() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["settings", "os_messages"],
    queryFn: api.getOsMessages,
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: (v: OsMessagesSettings) => api.saveOsMessages(v),
    onSuccess: (v) => {
      qc.setQueryData(["settings", "os_messages"], v);
      // O filtro "Pendentes" depende de quais eventos estão ligados
      qc.invalidateQueries({ queryKey: ["serviceOrders"] });
      toast.success("Mensagens salvas.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar as mensagens."),
  });
  return { settings: data ?? DEFAULT_OS_MESSAGES, loaded: !!data, isLoading, save };
}

// Histórico geral de avisos
export function useOsNotifications(status?: NotificationStatus) {
  return useQuery<OsNotification[]>({
    queryKey: ["osNotifications", status ?? "all"],
    queryFn: () => api.listOsNotifications({ status, limit: 300 }),
  });
}

// Histórico de uma OS (só busca quando há OS aberta no detalhe)
export function useOrderNotifications(osId: string | null) {
  return useQuery<OsNotification[]>({
    queryKey: ["orderNotifications", osId],
    queryFn: () => api.listOrderNotifications(osId as string),
    enabled: !!osId,
  });
}

// "Notificar agora" / reenviar
export function useNotifyOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ osId, event }: { osId: string; event?: OSEvent }) => api.notifyServiceOrder(osId, event),
    onSuccess: (res) => {
      announceNotification(res.notification);
      qc.invalidateQueries({ queryKey: ["serviceOrders"] });
      qc.invalidateQueries({ queryKey: ["osNotifications"] });
      qc.invalidateQueries({ queryKey: ["orderNotifications"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível enviar o aviso."),
  });
}
