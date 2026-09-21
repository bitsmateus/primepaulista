import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInventoryContext } from "@/contexts/InventoryContext";
import { useServiceOrderContext } from "@/contexts/ServiceOrderContext";
import { useFinancial } from "@/hooks/useFinancial";
import { OverviewTab } from "@/components/bi/OverviewTab";
import { CashClosingTab } from "@/components/bi/CashClosingTab";
import { ExpensesTab } from "@/components/bi/ExpensesTab";
import { TeamTab } from "@/components/bi/TeamTab";
import { InventoryAnalysisTab } from "@/components/bi/InventoryAnalysisTab";
import { CustomerAnalysisTab } from "@/components/bi/CustomerAnalysisTab";
import { ReceivablesTab } from "@/components/bi/ReceivablesTab";
import { PayablesTab } from "@/components/bi/PayablesTab";
import { ReconciliationTab } from "@/components/bi/ReconciliationTab";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";

export default function BIDashboardPage() {
  const { devices, accessories, sales } = useInventoryContext();
  const { orders } = useServiceOrderContext();
  const financial = useFinancial(sales, orders, devices, accessories);
  const { user } = useAuth();
  const canReconcile = can(user?.role, "reconcile");
  const [tab, setTab] = useState("overview");

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Business Intelligence</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestão financeira e análise de performance
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="flex w-full justify-start overflow-x-auto bg-muted">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="cash">Caixa</TabsTrigger>
            <TabsTrigger value="expenses">Despesas</TabsTrigger>
            <TabsTrigger value="team">Equipe</TabsTrigger>
            <TabsTrigger value="inventory">Inventário</TabsTrigger>
            <TabsTrigger value="customers">Clientes</TabsTrigger>
            <TabsTrigger value="receivables">A Receber</TabsTrigger>
            <TabsTrigger value="payables">A Pagar</TabsTrigger>
            {canReconcile && <TabsTrigger value="reconciliation">Conferência</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab financial={financial} />
          </TabsContent>
          <TabsContent value="cash">
            <CashClosingTab financial={financial} onOpenReconciliation={canReconcile ? () => setTab("reconciliation") : undefined} />
          </TabsContent>
          <TabsContent value="expenses">
            <ExpensesTab financial={financial} />
          </TabsContent>
          <TabsContent value="team">
            <TeamTab financial={financial} />
          </TabsContent>
          <TabsContent value="inventory">
            <InventoryAnalysisTab financial={financial} />
          </TabsContent>
          <TabsContent value="customers">
            <CustomerAnalysisTab />
          </TabsContent>
          <TabsContent value="receivables">
            <ReceivablesTab />
          </TabsContent>
          <TabsContent value="payables">
            <PayablesTab />
          </TabsContent>
          {canReconcile && (
            <TabsContent value="reconciliation">
              <ReconciliationTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
