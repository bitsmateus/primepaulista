import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Plus, ClipboardList } from "lucide-react";
import OSKanban from "@/components/assistencia/OSKanban";
import OSForm from "@/components/assistencia/OSForm";
import OSDashboard from "@/components/assistencia/OSDashboard";

export default function AssistenciaPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assistência Técnica</h1>
          <p className="text-muted-foreground">Gestão de Ordens de Serviço e reparos</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="kanban" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Painel de OS
            </TabsTrigger>
            <TabsTrigger value="nova-os" className="gap-2">
              <Plus className="h-4 w-4" />
              Nova OS
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <OSDashboard />
          </TabsContent>
          <TabsContent value="kanban">
            <OSKanban />
          </TabsContent>
          <TabsContent value="nova-os">
            <OSForm onCreated={() => setActiveTab("kanban")} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
