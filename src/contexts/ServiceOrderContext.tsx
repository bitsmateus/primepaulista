import { createContext, useContext, ReactNode } from "react";
import { useServiceOrders } from "@/hooks/useServiceOrders";

type ServiceOrderContextType = ReturnType<typeof useServiceOrders>;

const ServiceOrderContext = createContext<ServiceOrderContextType | null>(null);

export function ServiceOrderProvider({ children }: { children: ReactNode }) {
  const so = useServiceOrders();
  return <ServiceOrderContext.Provider value={so}>{children}</ServiceOrderContext.Provider>;
}

export function useServiceOrderContext() {
  const ctx = useContext(ServiceOrderContext);
  if (!ctx) throw new Error("useServiceOrderContext must be used within ServiceOrderProvider");
  return ctx;
}
