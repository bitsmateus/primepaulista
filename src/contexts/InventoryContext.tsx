import { createContext, useContext, ReactNode } from "react";
import { useInventory } from "@/hooks/useInventory";

type InventoryContextType = ReturnType<typeof useInventory>;

const InventoryContext = createContext<InventoryContextType | null>(null);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const inventory = useInventory();
  return (
    <InventoryContext.Provider value={inventory}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventoryContext() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInventoryContext must be used within InventoryProvider");
  return ctx;
}
