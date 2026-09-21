import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLayout } from "@/components/AppLayout";
import { LayoutDashboard, ClipboardList, MessageCircle } from "lucide-react";
import OSKanban from "@/components/assistencia/OSKanban";
import OSDashboard from "@/components/assistencia/OSDashboard";
import OSMessages from "@/components/assistencia/OSMessages";

export default function AssistenciaPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assistência Técnica</h1>
          <p className="text-muted-foreground">Gestão de Ordens de Serviço e reparos</p>
        </div>

        <Tabs defaultValue="kanban" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="kanban" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Painel de OS
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="mensagens" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              Mensagens
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kanban">
            <OSKanban />
          </TabsContent>
          <TabsContent value="dashboard">
            <OSDashboard />
          </TabsContent>
          <TabsContent value="mensagens">
            <OSMessages />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
