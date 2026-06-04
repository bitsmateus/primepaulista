import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Megaphone, Wifi } from "lucide-react";
import LeadsTab from "@/components/crm/LeadsTab";
import CampaignsTab from "@/components/crm/CampaignsTab";
import WhatsAppTab from "@/components/crm/WhatsAppTab";

export default function CRMPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM & WhatsApp</h1>
          <p className="text-muted-foreground">Gestão de leads, campanhas e integração WhatsApp</p>
        </div>

        <Tabs defaultValue="leads" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="leads" className="gap-2">
              <Users className="h-4 w-4" />
              Gestão de Leads
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Campanhas
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-2">
              <Wifi className="h-4 w-4" />
              Conectar WhatsApp
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leads">
            <LeadsTab />
          </TabsContent>
          <TabsContent value="campaigns">
            <CampaignsTab />
          </TabsContent>
          <TabsContent value="whatsapp">
            <WhatsAppTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
