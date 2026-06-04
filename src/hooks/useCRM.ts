import { useState, useCallback } from "react";
import { Lead, LeadStatus, MessageLog, UazapiConfig, ConnectionStatus, FunnelColumn } from "@/types/crm";

const DEFAULT_FUNNEL_COLUMNS: FunnelColumn[] = [
  { id: "novo", name: "Novo", color: "211 100% 45%" },
  { id: "contatado", name: "Contatado", color: "38 92% 50%" },
  { id: "negociacao", name: "Negociação", color: "25 95% 53%" },
  { id: "convertido", name: "Convertido", color: "160 84% 39%" },
  { id: "perdido", name: "Perdido", color: "0 84% 60%" },
];

export function useCRM() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [funnelColumns, setFunnelColumns] = useState<FunnelColumn[]>(() => {
    const stored = localStorage.getItem("crm_funnel_columns");
    return stored ? JSON.parse(stored) : DEFAULT_FUNNEL_COLUMNS;
  });
  const [uazapiConfig, setUazapiConfig] = useState<UazapiConfig>({
    apiKey: "",
    instanceUrl: "",
    instanceName: "",
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);

  // Funnel management
  const saveFunnelColumns = useCallback((columns: FunnelColumn[]) => {
    setFunnelColumns(columns);
    localStorage.setItem("crm_funnel_columns", JSON.stringify(columns));
  }, []);

  const addFunnelColumn = useCallback((name: string, color: string) => {
    const newCol: FunnelColumn = { id: crypto.randomUUID(), name, color };
    setFunnelColumns((prev) => {
      const updated = [...prev, newCol];
      localStorage.setItem("crm_funnel_columns", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeFunnelColumn = useCallback((id: string) => {
    setFunnelColumns((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      localStorage.setItem("crm_funnel_columns", JSON.stringify(updated));
      return updated;
    });
    // Move leads from removed column to first available
    setLeads((prev) =>
      prev.map((l) => {
        const cols = funnelColumns.filter((c) => c.id !== id);
        if (!cols.find((c) => c.name === l.status) && cols.length > 0) {
          return { ...l, status: cols[0].name };
        }
        return l;
      })
    );
  }, [funnelColumns]);

  const renameFunnelColumn = useCallback((id: string, newName: string) => {
    setFunnelColumns((prev) => {
      const old = prev.find((c) => c.id === id);
      const updated = prev.map((c) => (c.id === id ? { ...c, name: newName } : c));
      localStorage.setItem("crm_funnel_columns", JSON.stringify(updated));
      if (old) {
        setLeads((prevLeads) =>
          prevLeads.map((l) => (l.status === old.name ? { ...l, status: newName } : l))
        );
      }
      return updated;
    });
  }, []);

  const addLead = useCallback((lead: Omit<Lead, "id" | "createdAt">) => {
    const newLead: Lead = {
      ...lead,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    setLeads((prev) => [newLead, ...prev]);
    return newLead;
  }, []);

  const updateLeadStatus = useCallback((id: string, status: LeadStatus) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
  }, []);

  const deleteLead = useCallback((id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const moveLeadInColumn = useCallback((leadId: string, newStatus: string, index: number) => {
    setLeads((prev) => {
      const lead = prev.find((l) => l.id === leadId);
      if (!lead) return prev;
      const others = prev.filter((l) => l.id !== leadId);
      const updatedLead = { ...lead, status: newStatus };
      // Insert at the specified index within the column
      const columnLeads = others.filter((l) => l.status === newStatus);
      const nonColumnLeads = others.filter((l) => l.status !== newStatus);
      columnLeads.splice(index, 0, updatedLead);
      return [...nonColumnLeads, ...columnLeads];
    });
  }, []);

  const saveConfig = useCallback((config: UazapiConfig) => {
    setUazapiConfig(config);
    localStorage.setItem("uazapi_config", JSON.stringify(config));
  }, []);

  const loadConfig = useCallback((): UazapiConfig => {
    const stored = localStorage.getItem("uazapi_config");
    if (stored) {
      const config = JSON.parse(stored);
      setUazapiConfig(config);
      return config;
    }
    return uazapiConfig;
  }, [uazapiConfig]);

  const getBaseUrl = useCallback(() => {
    return uazapiConfig.instanceUrl.replace(/\/$/, "");
  }, [uazapiConfig]);

  const fetchQrCode = useCallback(async () => {
    try {
      setConnectionStatus("connecting");
      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/instance/qrcode`, {
        method: "GET",
        headers: { "Content-Type": "application/json", apikey: uazapiConfig.apiKey },
      });
      if (!response.ok) throw new Error(`Erro ${response.status}`);
      const data = await response.json();
      setQrCode(data.qrcode || data.base64 || data.code || null);
      return data;
    } catch (error) {
      setConnectionStatus("disconnected");
      throw error;
    }
  }, [uazapiConfig, getBaseUrl]);

  const checkStatus = useCallback(async () => {
    try {
      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/instance/status`, {
        method: "GET",
        headers: { "Content-Type": "application/json", apikey: uazapiConfig.apiKey },
      });
      if (!response.ok) throw new Error(`Erro ${response.status}`);
      const data = await response.json();
      const status = data.state || data.status || "disconnected";
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
  }, [uazapiConfig, getBaseUrl]);

  const disconnectInstance = useCallback(async () => {
    try {
      const baseUrl = getBaseUrl();
      await fetch(`${baseUrl}/instance/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: uazapiConfig.apiKey },
      });
      setConnectionStatus("disconnected");
      setQrCode(null);
    } catch (error) {
      throw error;
    }
  }, [uazapiConfig, getBaseUrl]);

  const restartInstance = useCallback(async () => {
    try {
      const baseUrl = getBaseUrl();
      await fetch(`${baseUrl}/instance/restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: uazapiConfig.apiKey },
      });
      setConnectionStatus("connecting");
    } catch (error) {
      throw error;
    }
  }, [uazapiConfig, getBaseUrl]);

  const sendMessage = useCallback(async (phone: string, message: string): Promise<boolean> => {
    try {
      const baseUrl = getBaseUrl();
      const cleanPhone = phone.replace(/\D/g, "");
      const response = await fetch(`${baseUrl}/message/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: uazapiConfig.apiKey },
        body: JSON.stringify({ number: cleanPhone, text: message }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, [uazapiConfig, getBaseUrl]);

  const addMessageLog = useCallback((log: Omit<MessageLog, "id" | "sentAt">) => {
    const newLog: MessageLog = { ...log, id: crypto.randomUUID(), sentAt: new Date() };
    setMessageLogs((prev) => [newLog, ...prev]);
    return newLog;
  }, []);

  const getLogsForRecipient = useCallback(
    (recipientId: string) => messageLogs.filter((l) => l.recipientId === recipientId),
    [messageLogs]
  );

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
