import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Megaphone, Wifi, Bot } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import LeadsTab from "@/components/crm/LeadsTab";
import CampaignsTab from "@/components/crm/CampaignsTab";
import WhatsAppTab from "@/components/crm/WhatsAppTab";
import AutomationsTab from "@/components/crm/AutomationsTab";

export default function CRMPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM & WhatsApp</h1>
          <p className="text-muted-foreground">Gestão de leads, campanhas e integração WhatsApp</p>
        </div>

        <Tabs defaultValue="leads" className="space-y-4">
          <TabsList className={`grid w-full ${isAdmin ? "grid-cols-4" : "grid-cols-2"}`}>
            <TabsTrigger value="leads" className="gap-2">
              <Users className="h-4 w-4" />
              Gestão de Leads
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Campanhas
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="automatico" className="gap-2">
                <Bot className="h-4 w-4" />
                Automático
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="whatsapp" className="gap-2">
                <Wifi className="h-4 w-4" />
                Conectar WhatsApp
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="leads">
            <LeadsTab />
          </TabsContent>
          <TabsContent value="campaigns">
            <CampaignsTab />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="automatico">
              <AutomationsTab />
            </TabsContent>
          )}
          {isAdmin && (
            <TabsContent value="whatsapp">
              <WhatsAppTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
