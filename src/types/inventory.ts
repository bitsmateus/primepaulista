export type DeviceCondition = "Lacrado" | "Seminovo";
export type DeviceStatus = "Disponível" | "Vendido" | "Em Manutenção" | "Reservado";

export type DeviceCategory = "iPhone" | "iPad" | "Apple Watch" | "Mac" | "AirPods" | "Outro";

export interface Device {
  id: string;
  category: string;
  model: string;
  capacity: string;
  color: string;
  condition: DeviceCondition;
  batteryHealth: number;
  supplier: string;
  cost: number;
  salePrice?: number;
  serialImei: string;
  internalSerial: string;
  status: DeviceStatus;
  createdAt: Date;
}

export type AccessoryCategory = "Capas" | "Películas" | "Cabos e Fontes";
export type AccessorySubcategory =
  | "Silicone" | "Couro" | "MagSafe" | "Space Z"
  | "3D" | "Cerâmica" | "Privacidade" | "Fosca"
  | "Cabo Lightning" | "Cabo USB-C" | "Fonte 20W" | "Fonte 35W";

export interface Accessory {
  id: string;
  name: string;
  category: AccessoryCategory;
  subcategory: AccessorySubcategory;
  compatibleModel: string;
  quantity: number;
  minQuantity: number;
  cost: number;
  price?: number;
  barcode: string;
  createdAt: Date;
}

// PDV Types
export type LeadOrigin = "Instagram" | "Indicação" | "Tráfego Pago";
export type PaymentMethod = "PIX" | "Dinheiro" | "Cartão de Crédito" | "Cartão de Débito";
export type Seller = string; // back armazena seller_name livre; vendedores reais: Gabriel/Matheus/Tassio

export interface Customer {
  id: string;
  name: string;
  cpf: string;
  whatsapp: string;
  birthday: string;
  leadOrigin: LeadOrigin;
  createdAt: Date;
}

export interface CartItem {
  id: string;
  type: "device" | "accessory";
  deviceId?: string;
  accessoryId?: string;
  name: string;
  serial?: string;
  price: number;
  quantity: number;
  warrantyDays?: number; // garantia do aparelho (Lacrado 365 / Seminovo 90)
}

export interface PaymentEntry {
  id: string;
  method: PaymentMethod;
  amount: number;
  installments?: number;
}

export interface TradeIn {
  imei: string;
  model: string;
  healthDescription: string;
  value: number;
  // Dados completos do aparelho (entra no estoque como novo dispositivo)
  category?: string;
  capacity?: string;
  color?: string;
  condition?: DeviceCondition;
  batteryHealth?: number;
}

export interface Sale {
  id: string;
  customer: Customer;
  items: CartItem[];
  payments: PaymentEntry[];
  tradeIn?: TradeIn;
  seller: Seller;
  subtotal: number;
  tradeInDiscount: number;
  discount: number;
  total: number;
  createdAt: Date;
  returnedAt?: Date; // preenchido se a venda foi devolvida/estornada
}
