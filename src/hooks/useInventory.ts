import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Device, Accessory, Customer, Sale } from "@/types/inventory";
import { api, ApiError } from "@/lib/api";

export function useInventory() {
  const qc = useQueryClient();

  // ----- Dados persistidos no banco (via API) -----
  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: api.listDevices,
  });
  const { data: accessories = [], isLoading: accessoriesLoading } = useQuery({
    queryKey: ["accessories"],
    queryFn: api.listAccessories,
  });

  const invalidateDevices = () => qc.invalidateQueries({ queryKey: ["devices"] });
  const invalidateAccessories = () =>
    qc.invalidateQueries({ queryKey: ["accessories"] });

  // ----- Clientes: persistidos no banco (via API) -----
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: api.listCustomers,
  });
  const invalidateCustomers = () =>
    qc.invalidateQueries({ queryKey: ["customers"] });

  // ----- Vendas: lidas do banco (com itens/pagamentos) para o BI/financeiro -----
  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: api.listSalesFull,
  });

  // ----- Mutations: aparelhos -----
  const addDeviceMut = useMutation({
    mutationFn: (device: Omit<Device, "id" | "createdAt">) => api.createDevice(device),
    onSuccess: invalidateDevices,
  });
  const deviceError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Falha na operação do aparelho.");

  const updateDeviceStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Device["status"] }) =>
      api.updateDevice(id, { status }),
    onSuccess: invalidateDevices,
    onError: deviceError,
  });
  const updateDeviceMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Device, "id" | "createdAt">> }) =>
      api.updateDevice(id, patch),
    onSuccess: invalidateDevices,
  });
  const deleteDeviceMut = useMutation({
    mutationFn: (id: string) => api.deleteDevice(id),
    onSuccess: invalidateDevices,
    onError: deviceError,
  });

  const addDevice = (device: Omit<Device, "id" | "createdAt">) =>
    addDeviceMut.mutateAsync(device);
  const updateDeviceStatus = (id: string, status: Device["status"]) =>
    updateDeviceStatusMut.mutate({ id, status });
  const updateDevice = (id: string, patch: Partial<Omit<Device, "id" | "createdAt">>) =>
    updateDeviceMut.mutateAsync({ id, patch });
  const deleteDevice = (id: string) => deleteDeviceMut.mutate(id);

  // ----- Mutations: acessórios -----
  const accessoryError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Falha na operação do acessório.");

  const addAccessoryMut = useMutation({
    mutationFn: (accessory: Omit<Accessory, "id" | "createdAt">) =>
      api.createAccessory(accessory),
    onSuccess: invalidateAccessories,
  });
  const updateAccessoryQtyMut = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api.updateAccessory(id, { quantity }),
    onSuccess: invalidateAccessories,
    onError: accessoryError,
  });
  const updateAccessoryMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Accessory, "id" | "createdAt">> }) =>
      api.updateAccessory(id, patch),
    onSuccess: invalidateAccessories,
  });
  const deleteAccessoryMut = useMutation({
    mutationFn: (id: string) => api.deleteAccessory(id),
    onSuccess: invalidateAccessories,
    onError: accessoryError,
  });

  const addAccessory = (accessory: Omit<Accessory, "id" | "createdAt">) =>
    addAccessoryMut.mutateAsync(accessory);
  const updateAccessoryQuantity = (id: string, quantity: number) =>
    updateAccessoryQtyMut.mutate({ id, quantity });
  const updateAccessory = (id: string, patch: Partial<Omit<Accessory, "id" | "createdAt">>) =>
    updateAccessoryMut.mutateAsync({ id, patch });
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
  const updateCustomerMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Customer, "id" | "createdAt">> }) =>
      api.updateCustomer(id, patch),
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
  const updateCustomer = (id: string, patch: Partial<Omit<Customer, "id" | "createdAt">>): Promise<Customer> =>
    updateCustomerMut.mutateAsync({ id, patch });
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
      discount: sale.discount,
      total: sale.total,
      items: sale.items.map((item) => ({
        productType: item.type,
        productId: (item.deviceId ?? item.accessoryId)!,
        name: item.name,
        serial: item.serial,
        price: item.price,
        quantity: item.quantity,
        warrantyDays: item.warrantyDays ?? 0,
      })),
      payments: sale.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        installments: p.installments,
      })),
      tradeIn: sale.tradeIn,
    });

    // Estoque e vendas mudaram no servidor → recarrega listas
    invalidateDevices();
    invalidateAccessories();
    qc.invalidateQueries({ queryKey: ["sales"] });

    const newSale: Sale = { ...sale, id: saleId, createdAt: new Date() };
    return newSale;
  };

  // Devolução/estorno de uma venda: restitui estoque no backend e recarrega listas
  const returnSaleMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.returnSale(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      invalidateDevices();
      invalidateAccessories();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível processar a devolução."),
  });
  const returnSale = (id: string, reason: string) => returnSaleMut.mutateAsync({ id, reason });

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
    devicesLoading,
    accessories,
    customers,
    customersLoading,
    updateCustomer,
    sales,
    addDevice,
    updateDeviceStatus,
    updateDevice,
    deleteDevice,
    accessoriesLoading,
    addAccessory,
    updateAccessoryQuantity,
    updateAccessory,
    deleteAccessory,
    findCustomer,
    addCustomer,
    deleteCustomer,
    returnSale,
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
