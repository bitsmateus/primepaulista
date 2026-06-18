import { Sale, Device, Accessory, CartItem } from "@/types/inventory";

// Mapas de custo por id (custo real cadastrado em devices/accessories).
export type DeviceMap = Record<string, Device>;
export type AccessoryMap = Record<string, Accessory>;

export function buildDeviceMap(devices: Device[]): DeviceMap {
  return Object.fromEntries(devices.map((d) => [d.id, d]));
}
export function buildAccessoryMap(accessories: Accessory[]): AccessoryMap {
  return Object.fromEntries(accessories.map((a) => [a.id, a]));
}

// Custo real (COGS) de um item da venda.
export function itemCost(item: CartItem, devicesById: DeviceMap, accessoriesById: AccessoryMap): number {
  if (item.type === "device") {
    const dev = item.deviceId ? devicesById[item.deviceId] : undefined;
    return (dev?.cost ?? 0) * item.quantity;
  }
  const acc = item.accessoryId ? accessoriesById[item.accessoryId] : undefined;
  return (acc?.cost ?? 0) * item.quantity;
}

// Custo total dos produtos de uma venda.
export function saleCogs(sale: Sale, devicesById: DeviceMap, accessoriesById: AccessoryMap): number {
  return sale.items.reduce((sum, it) => sum + itemCost(it, devicesById, accessoriesById), 0);
}

// Margem bruta da venda: receita líquida − custo dos produtos.
// sale.total já está líquido de discount e tradeInDiscount, então o desconto
// entra de forma exata. Venda devolvida não gera margem.
export function saleGrossProfit(sale: Sale, devicesById: DeviceMap, accessoriesById: AccessoryMap): number {
  if (sale.returnedAt) return 0;
  return sale.total - saleCogs(sale, devicesById, accessoriesById);
}

// Soma da margem bruta de um conjunto de vendas (ignora devolvidas).
export function salesGrossProfit(sales: Sale[], devicesById: DeviceMap, accessoriesById: AccessoryMap): number {
  return sales.reduce((sum, s) => sum + saleGrossProfit(s, devicesById, accessoriesById), 0);
}
