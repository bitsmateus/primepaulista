import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ServiceOrder, OSStatus } from "@/types/serviceOrder";
import { api } from "@/lib/api";

export function useServiceOrders() {
  const qc = useQueryClient();

  const { data: orders = [] } = useQuery({
    queryKey: ["serviceOrders"],
    queryFn: api.listServiceOrders,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["serviceOrders"] });

  const addOrderMut = useMutation({
    mutationFn: (order: Omit<ServiceOrder, "id" | "createdAt" | "updatedAt">) =>
      api.createServiceOrder(order),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["accessories"] }); // peça pode ter baixado
    },
  });
  const updateOrderMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ServiceOrder> }) =>
      api.updateServiceOrder(id, data),
    onSuccess: invalidate,
  });
  const deleteOrderMut = useMutation({
    mutationFn: (id: string) => api.deleteServiceOrder(id),
    onSuccess: invalidate,
  });

  const addOrder = (order: Omit<ServiceOrder, "id" | "createdAt" | "updatedAt">) =>
    addOrderMut.mutateAsync(order);

  const updateOrderStatus = (id: string, status: OSStatus) =>
    updateOrderMut.mutate({ id, data: { status } });

  const updateOrder = (id: string, data: Partial<ServiceOrder>) =>
    updateOrderMut.mutate({ id, data });

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
