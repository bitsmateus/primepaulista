import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Device, Accessory, Customer, Sale } from "@/types/inventory";
import { api, ApiError } from "@/lib/api";

export function useInventory() {
  const qc = useQueryClient();

  // ----- Dados persistidos no banco (via API) -----
  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: api.listDevices,
  });
  const { data: accessories = [] } = useQuery({
    queryKey: ["accessories"],
    queryFn: api.listAccessories,
  });

  const invalidateDevices = () => qc.invalidateQueries({ queryKey: ["devices"] });
  const invalidateAccessories = () =>
    qc.invalidateQueries({ queryKey: ["accessories"] });

  // ----- Clientes: persistidos no banco (via API) -----
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: api.listCustomers,
  });
  const invalidateCustomers = () =>
    qc.invalidateQueries({ queryKey: ["customers"] });

  // ----- Vendas: persistidas no banco; cópia local da sessão alimenta o BI -----
  const [sales, setSales] = useState<Sale[]>([]);

  // ----- Mutations: aparelhos -----
  const addDeviceMut = useMutation({
    mutationFn: (device: Omit<Device, "id" | "createdAt">) => api.createDevice(device),
    onSuccess: invalidateDevices,
  });
  const updateDeviceStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Device["status"] }) =>
      api.updateDevice(id, { status }),
    onSuccess: invalidateDevices,
  });
  const deleteDeviceMut = useMutation({
    mutationFn: (id: string) => api.deleteDevice(id),
    onSuccess: invalidateDevices,
  });

  const addDevice = (device: Omit<Device, "id" | "createdAt">) =>
    addDeviceMut.mutate(device);
  const updateDeviceStatus = (id: string, status: Device["status"]) =>
    updateDeviceStatusMut.mutate({ id, status });
  const deleteDevice = (id: string) => deleteDeviceMut.mutate(id);

  // ----- Mutations: acessórios -----
  const addAccessoryMut = useMutation({
    mutationFn: (accessory: Omit<Accessory, "id" | "createdAt">) =>
      api.createAccessory(accessory),
    onSuccess: invalidateAccessories,
  });
  const updateAccessoryQtyMut = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api.updateAccessory(id, { quantity }),
    onSuccess: invalidateAccessories,
  });
  const deleteAccessoryMut = useMutation({
    mutationFn: (id: string) => api.deleteAccessory(id),
    onSuccess: invalidateAccessories,
  });

  const addAccessory = (accessory: Omit<Accessory, "id" | "createdAt">) =>
    addAccessoryMut.mutate(accessory);
  const updateAccessoryQuantity = (id: string, quantity: number) =>
    updateAccessoryQtyMut.mutate({ id, quantity });
  const deleteAccessory = (id: string) => deleteAccessoryMut.mutate(id);

  // ----- Clientes (persistidos no banco) -----
  const findCustomer = (query: string): Customer | undefined => {
    const normalized = query.replace(/\D/g, "");
    const lowerQuery = query.trim().toLowerCase();
    return customers.find(
      (c) =>
        c.cpf.replace(/\D/g, "") === normalized ||
        c.whatsapp.replace(/\D/g, "") === normalized ||
        c.name.toLowerCase().includes(lowerQuery)
    );
  };

  const addCustomerMut = useMutation({
    mutationFn: (customer: Omit<Customer, "id" | "createdAt">) =>
      api.createCustomer(customer),
    onSuccess: invalidateCustomers,
  });
  const deleteCustomerMut = useMutation({
    mutationFn: (id: string) => api.deleteCustomer(id),
    onSuccess: invalidateCustomers,
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível excluir o cliente."
      ),
  });

  // Retorna o cliente persistido (com id real do banco)
  const addCustomer = (customer: Omit<Customer, "id" | "createdAt">): Promise<Customer> =>
    addCustomerMut.mutateAsync(customer);
  const deleteCustomer = (id: string) => deleteCustomerMut.mutate(id);

  // ----- Buscas / utilidades -----
  const findDeviceBySerial = (query: string): Device | undefined => {
    const q = query.trim().toLowerCase();
    return devices.find(
      (d) =>
        (d.status === "Disponível" || d.status === "Reservado") &&
        ((d.serialImei ?? "").toLowerCase() === q ||
          (d.internalSerial ?? "").toLowerCase() === q)
    );
  };

  const getCompatibleAccessories = (model: string): Accessory[] => {
    const baseModel = model.replace(/ Pro Max| Pro| Plus| Mini/gi, "").trim();
    return accessories.filter(
      (a) =>
        a.quantity > 0 &&
        ((a.compatibleModel ?? "") === model ||
          (a.compatibleModel ?? "").includes(baseModel) ||
          a.compatibleModel === "Universal")
    );
  };

  // ----- Finalizar venda: persiste no banco (transacional) e atualiza estoque -----
  const finalizeSale = async (sale: Omit<Sale, "id" | "createdAt">): Promise<Sale> => {
    const saleId = await api.createSale({
      customerId: sale.customer.id,
      sellerName: sale.seller,
      subtotal: sale.subtotal,
      tradeInDiscount: sale.tradeInDiscount,
      total: sale.total,
      items: sale.items.map((item) => ({
        productType: item.type,
        productId: (item.deviceId ?? item.accessoryId)!,
        name: item.name,
        serial: item.serial,
        price: item.price,
        quantity: item.quantity,
      })),
      payments: sale.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        installments: p.installments,
      })),
      tradeIn: sale.tradeIn,
    });

    // Estoque mudou no servidor (baixa transacional) → recarrega listas
    invalidateDevices();
    invalidateAccessories();

    const newSale: Sale = { ...sale, id: saleId, createdAt: new Date() };
    setSales((prev) => [newSale, ...prev]); // alimenta o BI da sessão
    return newSale;
  };

  const generateInternalSerial = () => {
    const year = new Date().getFullYear();
    const seq = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
    return `INT-${year}-${seq}`;
  };

  const generateBarcode = () => {
    const year = new Date().getFullYear();
    const seq = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
    return `ACC-${year}-${seq}`;
  };

  // ----- Estatísticas -----
  const totalInvested =
    devices
      .filter((d) => d.status !== "Vendido")
      .reduce((sum, d) => sum + d.cost, 0) +
    accessories.reduce((sum, a) => sum + a.cost * a.quantity, 0);

  const devicesInStore = devices.filter(
    (d) => d.status === "Disponível" || d.status === "Reservado"
  ).length;

  const lowStockAccessories = accessories.filter(
    (a) => a.quantity <= a.minQuantity
  );

  return {
    devices,
    accessories,
    customers,
    sales,
    addDevice,
    updateDeviceStatus,
    deleteDevice,
    addAccessory,
    updateAccessoryQuantity,
    deleteAccessory,
    findCustomer,
    addCustomer,
    deleteCustomer,
    findDeviceBySerial,
    getCompatibleAccessories,
    finalizeSale,
    generateInternalSerial,
    generateBarcode,
    totalInvested,
    devicesInStore,
    lowStockAccessories,
  };
}
