export type LeadStatus = string;

export interface FunnelColumn {
  id: string;
  name: string;
  color: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  modelInterest: string;
  origin: string;
  status: LeadStatus;
  notes: string;
  createdAt: Date;
}

export interface MessageLog {
  id: string;
  recipientId: string;
  recipientName: string;
  recipientPhone: string;
  templateType: string;
  message: string;
  sentAt: Date;
  status: "sent" | "failed" | "pending";
}

export interface UazapiConfig {
  apiKey: string;
  instanceUrl: string;
  instanceName: string;
}

export type ConnectionStatus = "connected" | "disconnected" | "connecting";
