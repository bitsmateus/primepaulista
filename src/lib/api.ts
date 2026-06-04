import { Device, Accessory, Customer, Sale } from "@/types/inventory";
import { ServiceOrder } from "@/types/serviceOrder";

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
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "vendedor" | "tecnico";
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
};

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
  tradeIn?: { imei: string; model: string; healthDescription: string; value: number };
}

export type { Sale };
