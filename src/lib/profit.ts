import { Sale, Device, Accessory, CartItem } from "@/types/inventory";
import { saleFullValue } from "@/lib/sales";

// Custo de emissão de nota fiscal quando o cliente exige: 0,5% sobre o valor
// de venda do(s) aparelho(s) (não incide sobre acessórios/brindes).
const INVOICE_COST_RATE = 0.005;

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

// Valor de venda do(s) aparelho(s) da venda (exclui acessórios) — base do custo de NF.
export function saleDeviceSaleValue(sale: Sale): number {
  return sale.items
    .filter((it) => it.type === "device")
    .reduce((sum, it) => sum + it.price * it.quantity, 0);
}

// Lucro líquido "real" da venda para o lojista: valor total do que foi vendido
// (sem descontar a troca, que é forma de pagamento e não custo — o aparelho
// recebido na troca já entra no estoque com seu próprio custo, gerando lucro
// quando revendido), menos o custo dos produtos, o custo dos brindes dados
// junto e, se o cliente exigiu nota fiscal, 0,5% sobre o valor do aparelho.
export function saleNetProfit(sale: Sale, devicesById: DeviceMap, accessoriesById: AccessoryMap): number {
  if (sale.returnedAt) return 0;
  const invoiceCost = sale.requiresInvoice ? saleDeviceSaleValue(sale) * INVOICE_COST_RATE : 0;
  return (
    saleFullValue(sale) -
    saleCogs(sale, devicesById, accessoriesById) -
    (sale.giftsCost || 0) -
    invoiceCost
  );
}
