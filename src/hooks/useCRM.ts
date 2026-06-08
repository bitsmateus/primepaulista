import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lead, MessageLog, UazapiConfig, ConnectionStatus, FunnelColumn } from "@/types/crm";
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

  // ----- WhatsApp/Uazapi: config no banco; envio via backend -----
  const { data: uazapiConfig = { apiKey: "", instanceUrl: "", instanceName: "" } } = useQuery({
    queryKey: ["whatsappConfig"],
    queryFn: api.getWhatsappConfig,
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);

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

  // ===== WhatsApp/Uazapi (config no banco; envio via backend) =====
  const saveConfigMut = useMutation({
    mutationFn: (config: UazapiConfig) => api.saveWhatsappConfig(config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsappConfig"] }),
    onError: crmError("Não foi possível salvar a configuração."),
  });
  const saveConfig = useCallback(
    (config: UazapiConfig) => saveConfigMut.mutate(config),
    [saveConfigMut]
  );

  const fetchQrCode = useCallback(async () => {
    setConnectionStatus("connecting");
    try {
      const qrcode = await api.whatsappQrCode();
      setQrCode(qrcode);
      return { qrcode };
    } catch (error) {
      setConnectionStatus("disconnected");
      throw error;
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const status = await api.whatsappStatus();
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

  // Autoverifica o status assim que a instância está configurada (corrige envio
  // bloqueado em Leads/Campanhas sem precisar abrir a aba WhatsApp antes).
  useEffect(() => {
    if (uazapiConfig.configured) checkStatus();
  }, [uazapiConfig.configured, checkStatus]);

  const disconnectInstance = useCallback(async () => {
    await api.whatsappDisconnect();
    setConnectionStatus("disconnected");
    setQrCode(null);
  }, []);

  const restartInstance = useCallback(async () => {
    await api.whatsappRestart();
    setConnectionStatus("connecting");
  }, []);

  const sendMessage = useCallback(
    (phone: string, message: string): Promise<boolean> => api.whatsappSend(phone, message),
    []
  );

  return {
    leads,
    leadsLoading,
    messageLogs,
    uazapiConfig,
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
    saveConfig,
    fetchQrCode,
    checkStatus,
    disconnectInstance,
    restartInstance,
    sendMessage,
    addMessageLog,
    getLogsForRecipient,
  };
}
