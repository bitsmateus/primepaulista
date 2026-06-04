import { Device, Accessory, Customer, Sale, CartItem, PaymentEntry, PaymentMethod, Seller } from "@/types/inventory";
import { ServiceOrder } from "@/types/serviceOrder";
import { Lead, FunnelColumn, MessageLog } from "@/types/crm";
import { Expense, Sangria, SellerCommissionConfig } from "@/types/financial";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";
const TOKEN_KEY = "pp_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      // JSON só quando há corpo e não é upload de arquivo (FormData define seu próprio header)
      ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    clearToken();
    // Avisa a aplicação para deslogar/redirecionar
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("pp:unauthorized"));
    }
    throw new ApiError(401, "Sessão expirada");
  }

  const data = res.headers.get("content-type")?.includes("application/json")
    ? await res.json()
    : null;

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "Erro na requisição");
  }
  return data as T;
}

// ---- Tipos de usuário ----
export type UserRole = "admin" | "vendedor" | "tecnico";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt?: string;
}

// ---- Mapeamento de dados (banco → tipos do front) ----
type DeviceRow = Omit<Device, "cost" | "createdAt"> & { cost: string; createdAt: string };
type AccessoryRow = Omit<Accessory, "cost" | "price" | "createdAt"> & {
  cost: string;
  price: string | null;
  createdAt: string;
};

type CustomerRow = Omit<Customer, "createdAt"> & { createdAt: string; leadOrigin: string | null };

function mapDevice(r: DeviceRow): Device {
  return { ...r, cost: Number(r.cost), createdAt: new Date(r.createdAt) };
}
function mapCustomer(r: CustomerRow): Customer {
  return {
    ...r,
    cpf: r.cpf ?? "",
    whatsapp: r.whatsapp ?? "",
    birthday: r.birthday ?? "",
    leadOrigin: (r.leadOrigin ?? "Instagram") as Customer["leadOrigin"],
    createdAt: new Date(r.createdAt),
  };
}

// Ordem de Serviço: banco usa colunas planas (checklist separado) e numeric como string
interface ServiceOrderRow {
  id: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerCpf: string | null;
  model: string;
  color: string | null;
  serialImei: string | null;
  batteryHealth: number | null;
  reportedIssue: string;
  technicalNotes: string | null;
  checklistCapa: boolean;
  checklistChip: boolean;
  checklistCarregador: boolean;
  status: ServiceOrder["status"];
  priority: ServiceOrder["priority"];
  partCost: string;
  laborCost: string;
  partDescription: string | null;
  partFromStock: boolean;
  stockAccessoryId: string | null;
  chargedAmount: string;
  taxes: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

function mapServiceOrder(r: ServiceOrderRow): ServiceOrder {
  return {
    id: r.id,
    customerId: r.customerId ?? undefined,
    customerName: r.customerName,
    customerPhone: r.customerPhone ?? "",
    customerCpf: r.customerCpf ?? "",
    model: r.model,
    color: r.color ?? "",
    serialImei: r.serialImei ?? "",
    batteryHealth: r.batteryHealth ?? 0,
    reportedIssue: r.reportedIssue,
    technicalNotes: r.technicalNotes ?? "",
    checklist: {
      capa: r.checklistCapa,
      chip: r.checklistChip,
      carregador: r.checklistCarregador,
    },
    status: r.status,
    priority: r.priority,
    partCost: Number(r.partCost),
    laborCost: Number(r.laborCost),
    partDescription: r.partDescription ?? "",
    partFromStock: r.partFromStock,
    stockAccessoryId: r.stockAccessoryId ?? undefined,
    chargedAmount: Number(r.chargedAmount),
    taxes: Number(r.taxes),
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
    completedAt: r.completedAt ? new Date(r.completedAt) : undefined,
  };
}

// Achata o ServiceOrder do front para o formato que a API espera (checklist separado)
function serviceOrderToWire(o: Partial<ServiceOrder>): Record<string, unknown> {
  const { checklist, ...rest } = o;
  const wire: Record<string, unknown> = { ...rest };
  if (checklist) {
    wire.checklistCapa = checklist.capa;
    wire.checklistChip = checklist.chip;
    wire.checklistCarregador = checklist.carregador;
  }
  // Datas e id não são enviados; o servidor controla
  delete wire.id;
  delete wire.createdAt;
  delete wire.updatedAt;
  delete wire.completedAt;
  return wire;
}
function mapAccessory(r: AccessoryRow): Accessory {
  return {
    ...r,
    cost: Number(r.cost),
    price: r.price !== null ? Number(r.price) : undefined,
    createdAt: new Date(r.createdAt),
  };
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: AuthUser }>("/auth/me"),

  // Usuários (admin)
  listUsers: () => request<{ users: ManagedUser[] }>("/users").then((d) => d.users),
  createUser: (input: { name: string; email: string; password: string; role: UserRole }) =>
    request<{ user: AuthUser }>("/users", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((d) => d.user),
  updateUser: (
    id: string,
    patch: { name?: string; role?: UserRole; active?: boolean; password?: string }
  ) =>
    request<{ user: ManagedUser }>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((d) => d.user),

  // Devices
  listDevices: () =>
    request<{ devices: DeviceRow[] }>("/devices").then((d) => d.devices.map(mapDevice)),
  createDevice: (input: Omit<Device, "id" | "createdAt">) =>
    request<{ device: DeviceRow }>("/devices", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((d) => mapDevice(d.device)),
  updateDevice: (id: string, patch: Partial<Omit<Device, "id" | "createdAt">>) =>
    request<{ device: DeviceRow }>(`/devices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((d) => mapDevice(d.device)),
  deleteDevice: (id: string) =>
    request<{ ok: true }>(`/devices/${id}`, { method: "DELETE" }),

  // Accessories
  listAccessories: () =>
    request<{ accessories: AccessoryRow[] }>("/accessories").then((d) =>
      d.accessories.map(mapAccessory)
    ),
  createAccessory: (input: Omit<Accessory, "id" | "createdAt">) =>
    request<{ accessory: AccessoryRow }>("/accessories", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((d) => mapAccessory(d.accessory)),
  updateAccessory: (id: string, patch: Partial<Omit<Accessory, "id" | "createdAt">>) =>
    request<{ accessory: AccessoryRow }>(`/accessories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((d) => mapAccessory(d.accessory)),
  deleteAccessory: (id: string) =>
    request<{ ok: true }>(`/accessories/${id}`, { method: "DELETE" }),

  // Customers
  listCustomers: () =>
    request<{ customers: CustomerRow[] }>("/customers").then((d) =>
      d.customers.map(mapCustomer)
    ),
  createCustomer: (input: Omit<Customer, "id" | "createdAt">) =>
    request<{ customer: CustomerRow }>("/customers", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((d) => mapCustomer(d.customer)),
  deleteCustomer: (id: string) =>
    request<{ ok: true }>(`/customers/${id}`, { method: "DELETE" }),

  // Sales
  createSale: (input: SalePayload) =>
    request<{ saleId: string }>("/sales", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((d) => d.saleId),
  listSalesFull: () =>
    request<{ sales: SaleFullRow[] }>("/sales/full").then((d) => d.sales.map(mapSaleFull)),

  // Service Orders
  listServiceOrders: () =>
    request<{ serviceOrders: ServiceOrderRow[] }>("/service-orders").then((d) =>
      d.serviceOrders.map(mapServiceOrder)
    ),
  createServiceOrder: (input: Omit<ServiceOrder, "id" | "createdAt" | "updatedAt">) =>
    request<{ serviceOrder: ServiceOrderRow }>("/service-orders", {
      method: "POST",
      body: JSON.stringify(serviceOrderToWire(input)),
    }).then((d) => mapServiceOrder(d.serviceOrder)),
  updateServiceOrder: (id: string, patch: Partial<ServiceOrder>) =>
    request<{ serviceOrder: ServiceOrderRow }>(`/service-orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(serviceOrderToWire(patch)),
    }).then((d) => mapServiceOrder(d.serviceOrder)),
  deleteServiceOrder: (id: string) =>
    request<{ ok: true }>(`/service-orders/${id}`, { method: "DELETE" }),

  // Fotos da OS (antes/depois)
  listOrderPhotos: (osId: string) =>
    request<{ photos: OrderPhoto[] }>(`/service-orders/${osId}/photos`).then(
      (d) => d.photos
    ),
  uploadOrderPhoto: (osId: string, type: "antes" | "depois", file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ photo: OrderPhoto }>(
      `/service-orders/${osId}/photos?type=${type}`,
      { method: "POST", body: form }
    ).then((d) => d.photo);
  },
  deleteOrderPhoto: (osId: string, photoId: string) =>
    request<{ ok: true }>(`/service-orders/${osId}/photos/${photoId}`, {
      method: "DELETE",
    }),

  // ===== CRM: funil =====
  listFunnelColumns: () =>
    request<{ funnelColumns: FunnelColumn[] }>("/funnel-columns").then(
      (d) => d.funnelColumns
    ),
  createFunnelColumn: (name: string, color: string) =>
    request<{ funnelColumn: FunnelColumn }>("/funnel-columns", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }).then((d) => d.funnelColumn),
  updateFunnelColumn: (id: string, patch: { name?: string; color?: string; position?: number }) =>
    request<{ funnelColumn: FunnelColumn }>(`/funnel-columns/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((d) => d.funnelColumn),
  deleteFunnelColumn: (id: string) =>
    request<{ ok: true }>(`/funnel-columns/${id}`, { method: "DELETE" }),

  // ===== CRM: leads =====
  listLeads: () =>
    request<{ leads: LeadRow[] }>("/leads").then((d) => d.leads.map(mapLead)),
  createLead: (input: Omit<Lead, "id" | "createdAt">) =>
    request<{ lead: LeadRow }>("/leads", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((d) => mapLead(d.lead)),
  updateLead: (id: string, patch: Partial<Omit<Lead, "id" | "createdAt">>) =>
    request<{ lead: LeadRow }>(`/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((d) => mapLead(d.lead)),
  deleteLead: (id: string) =>
    request<{ ok: true }>(`/leads/${id}`, { method: "DELETE" }),

  // ===== CRM: logs de mensagens =====
  listMessageLogs: () =>
    request<{ messageLogs: MessageLogRow[] }>("/message-logs").then((d) =>
      d.messageLogs.map(mapMessageLog)
    ),
  createMessageLog: (input: Omit<MessageLog, "id" | "sentAt">) =>
    request<{ messageLog: MessageLogRow }>("/message-logs", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((d) => mapMessageLog(d.messageLog)),

  // ===== WhatsApp (proxy seguro pelo backend) =====
  getWhatsappConfig: () =>
    request<{ config: WhatsappConfig }>("/whatsapp/config").then((d) => d.config),
  saveWhatsappConfig: (config: WhatsappConfig) =>
    request<{ config: WhatsappConfig }>("/whatsapp/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }).then((d) => d.config),
  whatsappStatus: () =>
    request<{ status: string }>("/whatsapp/status").then((d) => d.status),
  whatsappQrCode: () =>
    request<{ qrcode: string | null }>("/whatsapp/qrcode").then((d) => d.qrcode),
  whatsappDisconnect: () =>
    request<{ ok: true }>("/whatsapp/disconnect", { method: "POST" }),
  whatsappRestart: () =>
    request<{ ok: true }>("/whatsapp/restart", { method: "POST" }),
  whatsappSend: (phone: string, message: string) =>
    request<{ success: boolean }>("/whatsapp/send", {
      method: "POST",
      body: JSON.stringify({ phone, message }),
    }).then((d) => d.success),

  // ===== CRM automático =====
  listAutomations: () =>
    request<{ automations: Automation[] }>("/automations").then((d) => d.automations),
  updateAutomation: (
    key: string,
    patch: { enabled?: boolean; daysAfter?: number; message?: string }
  ) =>
    request<{ automation: Automation }>(`/automations/${key}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }).then((d) => d.automation),
  runAutomations: () =>
    request<{ summary: AutomationRunSummary }>("/automations/run", {
      method: "POST",
    }).then((d) => d.summary),

  // ===== Financeiro =====
  listExpenses: () =>
    request<{ expenses: ExpenseRow[] }>("/expenses").then((d) => d.expenses.map(mapExpense)),
  createExpense: (input: Omit<Expense, "id">) =>
    request<{ expense: ExpenseRow }>("/expenses", {
      method: "POST",
      body: JSON.stringify({ ...input, date: input.date.toISOString() }),
    }).then((d) => mapExpense(d.expense)),
  deleteExpense: (id: string) =>
    request<{ ok: true }>(`/expenses/${id}`, { method: "DELETE" }),

  listSangrias: () =>
    request<{ sangrias: SangriaRow[] }>("/sangrias").then((d) => d.sangrias.map(mapSangria)),
  createSangria: (input: Omit<Sangria, "id">) =>
    request<{ sangria: SangriaRow }>("/sangrias", {
      method: "POST",
      body: JSON.stringify({ ...input, date: input.date.toISOString() }),
    }).then((d) => mapSangria(d.sangria)),

  listCommissions: () =>
    request<{ commissions: CommissionRow[] }>("/seller-commissions").then((d) =>
      d.commissions.map(mapCommission)
    ),
  updateCommission: (sellerName: string, patch: { devicePercent?: number; accessoryPercent?: number }) =>
    request<{ commission: CommissionRow }>(`/seller-commissions/${encodeURIComponent(sellerName)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }).then((d) => mapCommission(d.commission)),

  listReceivables: () =>
    request<{ receivables: ReceivableRow[] }>("/receivables").then((d) =>
      d.receivables.map(mapReceivable)
    ),
  createReceivable: (input: { customerId?: string; saleId?: string; amount: number; dueDate?: string }) =>
    request<{ receivable: ReceivableRow }>("/receivables", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((d) => mapReceivable(d.receivable)),
  updateReceivableStatus: (id: string, status: Receivable["status"]) =>
    request<{ receivable: ReceivableRow }>(`/receivables/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).then((d) => mapReceivable(d.receivable)),
  deleteReceivable: (id: string) =>
    request<{ ok: true }>(`/receivables/${id}`, { method: "DELETE" }),
};

// ----- Mapeamento financeiro -----
type ExpenseRow = Omit<Expense, "amount" | "date"> & { amount: string; date: string };
type SangriaRow = Omit<Sangria, "amount" | "date"> & { amount: string; date: string };
interface CommissionRow {
  sellerName: string;
  devicePercent: string;
  accessoryPercent: string;
}
export interface Receivable {
  id: string;
  customerId: string | null;
  saleId: string | null;
  amount: number;
  dueDate: Date | null;
  status: "pendente" | "pago" | "atrasado";
  paidAt: Date | null;
  createdAt: Date;
}
interface ReceivableRow {
  id: string;
  customerId: string | null;
  saleId: string | null;
  amount: string;
  dueDate: string | null;
  status: "pendente" | "pago" | "atrasado";
  paidAt: string | null;
  createdAt: string;
}

function mapExpense(r: ExpenseRow): Expense {
  return { ...r, amount: Number(r.amount), date: new Date(r.date) };
}
function mapSangria(r: SangriaRow): Sangria {
  return { ...r, amount: Number(r.amount), date: new Date(r.date), justification: r.justification ?? "" };
}
function mapCommission(r: CommissionRow): SellerCommissionConfig {
  return {
    seller: r.sellerName,
    devicePercent: Number(r.devicePercent),
    accessoryPercent: Number(r.accessoryPercent),
  };
}
function mapReceivable(r: ReceivableRow): Receivable {
  return {
    ...r,
    amount: Number(r.amount),
    dueDate: r.dueDate ? new Date(r.dueDate) : null,
    paidAt: r.paidAt ? new Date(r.paidAt) : null,
    createdAt: new Date(r.createdAt),
  };
}

export interface WhatsappConfig {
  apiKey: string;
  instanceUrl: string;
  instanceName: string;
  configured?: boolean;
}

export interface Automation {
  id: string;
  key: string;
  enabled: boolean;
  daysAfter: number;
  message: string;
  updatedAt: string;
}

export interface AutomationRunSummary {
  whatsappConfigured: boolean;
  posVenda: { attempted: number; sent: number };
  reativacao: { attempted: number; sent: number };
}

// ----- Mapeamento CRM (datas como string → Date) -----
type LeadRow = Omit<Lead, "createdAt"> & { createdAt: string };
type MessageLogRow = Omit<MessageLog, "sentAt"> & { sentAt: string };

function mapLead(r: LeadRow): Lead {
  return {
    ...r,
    phone: r.phone ?? "",
    modelInterest: r.modelInterest ?? "",
    origin: r.origin ?? "",
    notes: r.notes ?? "",
    createdAt: new Date(r.createdAt),
  };
}
function mapMessageLog(r: MessageLogRow): MessageLog {
  return { ...r, sentAt: new Date(r.sentAt) };
}

export interface OrderPhoto {
  id: string;
  type: "antes" | "depois";
  url: string;
  createdAt: string;
}

// Payload enviado ao finalizar uma venda
export interface SalePayload {
  customerId: string;
  sellerName: string;
  subtotal: number;
  tradeInDiscount: number;
  total: number;
  items: {
    productType: "device" | "accessory";
    productId: string;
    name: string;
    serial?: string;
    price: number;
    quantity: number;
  }[];
  payments: { method: string; amount: number; installments?: number }[];
  tradeIn?: {
    imei: string;
    model: string;
    healthDescription: string;
    value: number;
    category?: string;
    capacity?: string;
    color?: string;
    condition?: "Lacrado" | "Seminovo";
    batteryHealth?: number;
  };
}

export type { Sale };

// ----- Venda completa (aninhada) → tipo Sale do front -----
interface SaleFullRow {
  id: string;
  sellerName: string | null;
  subtotal: string;
  tradeInDiscount: string;
  total: string;
  createdAt: string;
  customer: (Omit<Customer, "createdAt"> & { createdAt: string; leadOrigin: string | null }) | null;
  items: { id: string; productType: "device" | "accessory"; productId: string | null; name: string; serial: string | null; price: string; quantity: number }[];
  payments: { id: string; method: string; amount: string; installments: number | null }[];
  tradeIn: { imei: string | null; model: string | null; healthDescription: string | null; value: string } | null;
}

function mapSaleFull(r: SaleFullRow): Sale {
  const customer: Customer = r.customer
    ? mapCustomer(r.customer)
    : { id: "", name: "Cliente", cpf: "", whatsapp: "", birthday: "", leadOrigin: "Instagram", createdAt: new Date() };

  const items: CartItem[] = r.items.map((it) => ({
    id: it.id,
    type: it.productType,
    deviceId: it.productType === "device" ? it.productId ?? undefined : undefined,
    accessoryId: it.productType === "accessory" ? it.productId ?? undefined : undefined,
    name: it.name,
    serial: it.serial ?? undefined,
    price: Number(it.price),
    quantity: it.quantity,
  }));

  const payments: PaymentEntry[] = r.payments.map((p) => ({
    id: p.id,
    method: p.method as PaymentMethod,
    amount: Number(p.amount),
    installments: p.installments ?? undefined,
  }));

  return {
    id: r.id,
    customer,
    items,
    payments,
    tradeIn: r.tradeIn
      ? {
          imei: r.tradeIn.imei ?? "",
          model: r.tradeIn.model ?? "",
          healthDescription: r.tradeIn.healthDescription ?? "",
          value: Number(r.tradeIn.value),
        }
      : undefined,
    seller: (r.sellerName ?? "") as Seller,
    subtotal: Number(r.subtotal),
    tradeInDiscount: Number(r.tradeInDiscount),
    total: Number(r.total),
    createdAt: new Date(r.createdAt),
  };
}
