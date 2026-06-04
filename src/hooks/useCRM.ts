import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lead, LeadStatus, MessageLog, UazapiConfig, ConnectionStatus, FunnelColumn } from "@/types/crm";
import { api } from "@/lib/api";

export function useCRM() {
  const qc = useQueryClient();

  // ----- Dados persistidos no banco -----
  const { data: leads = [] } = useQuery({ queryKey: ["leads"], queryFn: api.listLeads });
  const { data: funnelColumns = [] } = useQuery({
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
  });
  const updateColumnMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; color?: string; position?: number } }) =>
      api.updateFunnelColumn(id, patch),
    onSuccess: invalidateColumns,
  });
  const deleteColumnMut = useMutation({
    mutationFn: (id: string) => api.deleteFunnelColumn(id),
    onSuccess: invalidateColumns,
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
  // Salva a ordem das colunas (atualiza positions)
  const saveFunnelColumns = useCallback(
    (columns: FunnelColumn[]) => {
      columns.forEach((c, i) => updateColumnMut.mutate({ id: c.id, patch: { position: i } }));
    },
    [updateColumnMut]
  );

  // ===== Leads =====
  const addLeadMut = useMutation({
    mutationFn: (lead: Omit<Lead, "id" | "createdAt">) => api.createLead(lead),
    onSuccess: invalidateLeads,
  });
  const updateLeadMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Lead, "id" | "createdAt">> }) =>
      api.updateLead(id, patch),
    onSuccess: invalidateLeads,
  });
  const deleteLeadMut = useMutation({
    mutationFn: (id: string) => api.deleteLead(id),
    onSuccess: invalidateLeads,
  });

  const addLead = useCallback(
    (lead: Omit<Lead, "id" | "createdAt">) => addLeadMut.mutateAsync(lead),
    [addLeadMut]
  );
  const updateLeadStatus = useCallback(
    (id: string, status: LeadStatus) => updateLeadMut.mutate({ id, patch: { status } }),
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
  });
  const saveConfig = useCallback(
    (config: UazapiConfig) => saveConfigMut.mutate(config),
    [saveConfigMut]
  );
  // Mantido por compatibilidade; a config agora vem do banco via query
  const loadConfig = useCallback((): UazapiConfig => uazapiConfig, [uazapiConfig]);

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

  // ===== Estatísticas =====
  const leadsByStatus = leads.reduce(
    (acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    },
    {} as Record<LeadStatus, number>
  );

  return {
    leads,
    messageLogs,
    uazapiConfig,
    connectionStatus,
    qrCode,
    funnelColumns,
    addLead,
    updateLeadStatus,
    deleteLead,
    moveLeadInColumn,
    saveFunnelColumns,
    addFunnelColumn,
    removeFunnelColumn,
    renameFunnelColumn,
    saveConfig,
    loadConfig,
    fetchQrCode,
    checkStatus,
    disconnectInstance,
    restartInstance,
    sendMessage,
    addMessageLog,
    getLogsForRecipient,
    leadsByStatus,
    setConnectionStatus,
  };
}
