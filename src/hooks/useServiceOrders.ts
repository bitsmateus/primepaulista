import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ServiceOrder, OSStatus } from "@/types/serviceOrder";
import { api, ApiError, OsMutationResult, OsNotifyResult } from "@/lib/api";
import { OS_EVENT_LABELS } from "@/lib/osMessages";

// Avisa o usuário do que aconteceu com a notificação de WhatsApp (nunca bloqueia a mudança de status)
export function announceNotification(n: OsNotifyResult | null | undefined) {
  if (!n) return;
  const label = OS_EVENT_LABELS[n.event];
  if (n.status === "sent") toast.success(`Cliente avisado por WhatsApp (${label}).`);
  else if (n.status === "failed") toast.warning(`Aviso de WhatsApp não enviado (${label}): ${n.error ?? "erro do provedor"}`);
  else toast.info(`Aviso de WhatsApp pendente (${label}): ${n.error ?? "aguardando envio"}`);
}

export function useServiceOrders() {
  const qc = useQueryClient();

  const osError = (fallback: string) => (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : fallback);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["serviceOrders"],
    queryFn: api.listServiceOrders,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["serviceOrders"] });
  // OS de aparelho do estoque mexe no status/local do aparelho; avisos entram no histórico
  const invalidateRelated = () => {
    invalidate();
    qc.invalidateQueries({ queryKey: ["devices"] });
    qc.invalidateQueries({ queryKey: ["osNotifications"] });
    qc.invalidateQueries({ queryKey: ["orderNotifications"] });
  };

  const addOrderMut = useMutation({
    mutationFn: (order: Omit<ServiceOrder, "id" | "createdAt" | "updatedAt">) =>
      api.createServiceOrder(order),
    onSuccess: (res: OsMutationResult) => {
      invalidateRelated();
      qc.invalidateQueries({ queryKey: ["accessories"] }); // peça pode ter baixado
      announceNotification(res.notification);
    },
  });
  const updateOrderMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ServiceOrder> }) =>
      api.updateServiceOrder(id, data),
    onSuccess: (res: OsMutationResult) => {
      invalidateRelated();
      announceNotification(res.notification);
    },
    onError: osError("Não foi possível atualizar a OS."),
  });
  const deleteOrderMut = useMutation({
    mutationFn: (id: string) => api.deleteServiceOrder(id),
    onSuccess: invalidateRelated,
    onError: osError("Não foi possível excluir a OS."),
  });

  const addOrder = (order: Omit<ServiceOrder, "id" | "createdAt" | "updatedAt">) =>
    addOrderMut.mutateAsync(order);

  const updateOrderStatus = (id: string, status: OSStatus) =>
    updateOrderMut.mutateAsync({ id, data: { status } });

  const updateOrder = (id: string, data: Partial<ServiceOrder>) =>
    updateOrderMut.mutateAsync({ id, data });

  const deleteOrder = (id: string) => deleteOrderMut.mutate(id);

  // Mover no Kanban = mudar o status (a ordenação fina dentro da coluna não é persistida)
  const moveOrderInKanban = (orderId: string, newStatus: OSStatus, _index: number) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === newStatus) return;
    updateOrderMut.mutate({ id: orderId, data: { status: newStatus } });
  };

  // ----- Estatísticas -----
  const openOrders = orders.filter((o) => o.status !== "Entregue / Finalizado").length;

  const monthlyProfit = orders
    .filter((o) => {
      const now = new Date();
      return (
        o.status === "Entregue / Finalizado" &&
        o.completedAt &&
        new Date(o.completedAt).getMonth() === now.getMonth() &&
        new Date(o.completedAt).getFullYear() === now.getFullYear()
      );
    })
    .reduce((sum, o) => sum + (o.chargedAmount - o.partCost - o.taxes), 0);

  const pendingOver3Days = orders.filter((o) => {
    if (o.status === "Entregue / Finalizado") return false;
    const diff = (Date.now() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return diff > 3;
  }).length;

  return {
    orders,
    ordersLoading,
    addOrder,
    updateOrderStatus,
    updateOrder,
    deleteOrder,
    moveOrderInKanban,
    openOrders,
    monthlyProfit,
    pendingOver3Days,
  };
}
