import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lead, MessageLog, ConnectionStatus, FunnelColumn } from "@/types/crm";
import { api, ApiError } from "@/lib/api";

export function useCRM() {
  const qc = useQueryClient();

  const crmError = (fallback: string) => (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : fallback);

  // ----- Dados persistidos no banco -----
  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: api.listLeads,
  });
  const { data: funnelColumns = [], isLoading: columnsLoading } = useQuery({
    queryKey: ["funnelColumns"],
    queryFn: api.listFunnelColumns,
  });
  const { data: messageLogs = [] } = useQuery({
    queryKey: ["messageLogs"],
    queryFn: api.listMessageLogs,
  });

  const invalidateLeads = () => qc.invalidateQueries({ queryKey: ["leads"] });
  const invalidateColumns = () => {
    qc.invalidateQueries({ queryKey: ["funnelColumns"] });
    qc.invalidateQueries({ queryKey: ["leads"] }); // status de leads pode mudar
  };
  const invalidateLogs = () => qc.invalidateQueries({ queryKey: ["messageLogs"] });

  // ----- WhatsApp/Uazapi: múltiplas instâncias; envio via backend -----
  const { data: instances = [] } = useQuery({
    queryKey: ["whatsappInstances"],
    queryFn: api.listWhatsappInstances,
  });
  const invalidateInstances = () => qc.invalidateQueries({ queryKey: ["whatsappInstances"] });
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);

  // Seleciona a 1ª instância configurada por padrão
  useEffect(() => {
    if (!selectedInstanceId && instances.length) {
      setSelectedInstanceId((instances.find((i) => i.configured) ?? instances[0]).id);
    }
  }, [instances, selectedInstanceId]);

  // ===== Colunas do funil =====
  const addColumnMut = useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) =>
      api.createFunnelColumn(name, color),
    onSuccess: invalidateColumns,
    onError: crmError("Não foi possível adicionar a coluna."),
  });
  const updateColumnMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; color?: string; position?: number } }) =>
      api.updateFunnelColumn(id, patch),
    onSuccess: invalidateColumns,
    onError: crmError("Não foi possível atualizar a coluna."),
  });
  const deleteColumnMut = useMutation({
    mutationFn: (id: string) => api.deleteFunnelColumn(id),
    onSuccess: invalidateColumns,
    onError: crmError("Não foi possível remover a coluna."),
  });

  const addFunnelColumn = useCallback(
    (name: string, color: string) => addColumnMut.mutate({ name, color }),
    [addColumnMut]
  );
  const removeFunnelColumn = useCallback(
    (id: string) => deleteColumnMut.mutate(id),
    [deleteColumnMut]
  );
  const renameFunnelColumn = useCallback(
    (id: string, newName: string) => updateColumnMut.mutate({ id, patch: { name: newName } }),
    [updateColumnMut]
  );

  // ===== Leads =====
  const addLeadMut = useMutation({
    mutationFn: (lead: Omit<Lead, "id" | "createdAt">) => api.createLead(lead),
    onSuccess: invalidateLeads,
    onError: crmError("Não foi possível salvar o lead."),
  });
  const updateLeadMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Lead, "id" | "createdAt">> }) =>
      api.updateLead(id, patch),
    onSuccess: invalidateLeads,
    onError: crmError("Não foi possível atualizar o lead."),
  });
  const deleteLeadMut = useMutation({
    mutationFn: (id: string) => api.deleteLead(id),
    onSuccess: invalidateLeads,
    onError: crmError("Não foi possível remover o lead."),
  });

  const addLead = useCallback(
    (lead: Omit<Lead, "id" | "createdAt">) => addLeadMut.mutateAsync(lead),
    [addLeadMut]
  );
  const updateLead = useCallback(
    (id: string, patch: Partial<Omit<Lead, "id" | "createdAt">>) =>
      updateLeadMut.mutateAsync({ id, patch }),
    [updateLeadMut]
  );
  const deleteLead = useCallback((id: string) => deleteLeadMut.mutate(id), [deleteLeadMut]);
  // Mover no Kanban = mudar status (ordenação fina dentro da coluna não é persistida)
  const moveLeadInColumn = useCallback(
    (leadId: string, newStatus: string, _index: number) =>
      updateLeadMut.mutate({ id: leadId, patch: { status: newStatus } }),
    [updateLeadMut]
  );

  // ===== Logs de mensagens =====
  const addLogMut = useMutation({
    mutationFn: (log: Omit<MessageLog, "id" | "sentAt">) => api.createMessageLog(log),
    onSuccess: invalidateLogs,
  });
  const addMessageLog = useCallback(
    (log: Omit<MessageLog, "id" | "sentAt">) => addLogMut.mutate(log),
    [addLogMut]
  );
  const getLogsForRecipient = useCallback(
    (recipientId: string) => messageLogs.filter((l) => l.recipientId === recipientId),
    [messageLogs]
  );

  // ===== WhatsApp/Uazapi (instâncias; envio via backend) =====
  const createInstanceMut = useMutation({
    mutationFn: (input: { name: string; apiKey: string; instanceUrl: string; instanceName?: string }) =>
      api.createWhatsappInstance(input),
    onSuccess: invalidateInstances,
    onError: crmError("Não foi possível criar a instância."),
  });
  const updateInstanceMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.updateWhatsappInstance>[1] }) =>
      api.updateWhatsappInstance(id, input),
    onSuccess: invalidateInstances,
    onError: crmError("Não foi possível atualizar a instância."),
  });
  const deleteInstanceMut = useMutation({
    mutationFn: (id: string) => api.deleteWhatsappInstance(id),
    onSuccess: invalidateInstances,
    onError: crmError("Não foi possível remover a instância."),
  });
  const createInstance = useCallback(
    (input: { name: string; apiKey: string; instanceUrl: string; instanceName?: string }) =>
      createInstanceMut.mutateAsync(input),
    [createInstanceMut]
  );
  const updateInstance = useCallback(
    (id: string, input: Parameters<typeof api.updateWhatsappInstance>[1]) =>
      updateInstanceMut.mutateAsync({ id, input }),
    [updateInstanceMut]
  );
  const deleteInstance = useCallback((id: string) => deleteInstanceMut.mutate(id), [deleteInstanceMut]);

  const fetchQrCode = useCallback(async (id: string) => {
    setConnectionStatus("connecting");
    try {
      const qrcode = await api.whatsappQrCode(id);
      setQrCode(qrcode);
      return { qrcode };
    } catch (error) {
      setConnectionStatus("disconnected");
      throw error;
    }
  }, []);

  const checkStatus = useCallback(async (id: string) => {
    try {
      const status = await api.whatsappStatus(id);
      if (status === "open" || status === "connected") {
        setConnectionStatus("connected");
        setQrCode(null);
      } else if (status === "connecting") {
        setConnectionStatus("connecting");
      } else {
        setConnectionStatus("disconnected");
      }
      return status;
    } catch {
      setConnectionStatus("disconnected");
      return "disconnected";
    }
  }, []);

  // Autoverifica o status da instância selecionada (corrige envio bloqueado em
  // Leads/Campanhas sem precisar abrir a aba WhatsApp antes).
  useEffect(() => {
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (inst?.configured) checkStatus(inst.id);
  }, [selectedInstanceId, instances, checkStatus]);

  const disconnectInstance = useCallback(async (id: string) => {
    await api.whatsappDisconnect(id);
    setConnectionStatus("disconnected");
    setQrCode(null);
  }, []);

  const restartInstance = useCallback(async (id: string) => {
    await api.whatsappRestart(id);
    setConnectionStatus("connecting");
  }, []);

  // Envia pela instância informada ou pela selecionada
  const sendMessage = useCallback(
    (phone: string, message: string, instanceId?: string): Promise<boolean> => {
      const id = instanceId || selectedInstanceId;
      if (!id) return Promise.resolve(false);
      return api.whatsappSend(id, phone, message);
    },
    [selectedInstanceId]
  );

  const sendMedia = useCallback(
    (phone: string, imageUrl: string, caption: string, instanceId?: string): Promise<boolean> => {
      const id = instanceId || selectedInstanceId;
      if (!id) return Promise.resolve(false);
      return api.whatsappSendMedia(id, phone, imageUrl, caption);
    },
    [selectedInstanceId]
  );

  const uploadCampaignImage = useCallback((file: File) => api.uploadCampaignImage(file), []);

  return {
    leads,
    leadsLoading,
    messageLogs,
    instances,
    selectedInstanceId,
    setSelectedInstanceId,
    connectionStatus,
    qrCode,
    funnelColumns,
    columnsLoading,
    addLead,
    updateLead,
    deleteLead,
    moveLeadInColumn,
    addFunnelColumn,
    removeFunnelColumn,
    renameFunnelColumn,
    createInstance,
    updateInstance,
    deleteInstance,
    fetchQrCode,
    checkStatus,
    disconnectInstance,
    restartInstance,
    sendMessage,
    sendMedia,
    uploadCampaignImage,
    addMessageLog,
    getLogsForRecipient,
  };
}
