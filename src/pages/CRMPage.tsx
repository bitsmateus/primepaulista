import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Megaphone, Wifi, Bot, CalendarCheck, MessageSquareText, Reply, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";
import LeadsTab from "@/components/crm/LeadsTab";
import CampaignsTab from "@/components/crm/CampaignsTab";
import WhatsAppTab from "@/components/crm/WhatsAppTab";
import AutomationsTab from "@/components/crm/AutomationsTab";
import AgendaTab from "@/components/crm/AgendaTab";
import QuickRepliesTab from "@/components/crm/QuickRepliesTab";
import AutoRepliesTab from "@/components/crm/AutoRepliesTab";
import AiReviewsTab from "@/components/ai/AiReviewsTab";
import { useAiStatus } from "@/hooks/useAI";
import { Badge } from "@/components/ui/badge";

export default function CRMPage() {
  const { user } = useAuth();
  const canAutomations = can(user?.role, "manageAutomations");
  const canWhatsapp = can(user?.role, "manageWhatsapp");
  const canAI = can(user?.role, "useAI");
  const { data: aiStatus } = useAiStatus();
  const aiPending = aiStatus?.pendingReviews ?? 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM & WhatsApp</h1>
          <p className="text-muted-foreground">Funil de vendas, agenda de follow-up, respostas e integração WhatsApp</p>
        </div>

        <Tabs defaultValue="leads" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="leads" className="gap-2">
              <Users className="h-4 w-4" />
              Gestão de Leads
            </TabsTrigger>
            <TabsTrigger value="agenda" className="gap-2">
              <CalendarCheck className="h-4 w-4" />
              Agenda
            </TabsTrigger>
            <TabsTrigger value="rapidas" className="gap-2">
              <MessageSquareText className="h-4 w-4" />
              Respostas rápidas
            </TabsTrigger>
            <TabsTrigger value="respostas" className="gap-2">
              <Reply className="h-4 w-4" />
              Respostas automáticas
            </TabsTrigger>
            {canAI && (
              <TabsTrigger value="revisao" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Revisão da IA
                {aiPending > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-[11px]" data-testid="ai-pending-badge">{aiPending}</Badge>}
              </TabsTrigger>
            )}
            <TabsTrigger value="campaigns" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Campanhas
            </TabsTrigger>
            {canAutomations && (
              <TabsTrigger value="automatico" className="gap-2">
                <Bot className="h-4 w-4" />
                Automático
              </TabsTrigger>
            )}
            {canWhatsapp && (
              <TabsTrigger value="whatsapp" className="gap-2">
                <Wifi className="h-4 w-4" />
                Conectar WhatsApp
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="leads">
            <LeadsTab />
          </TabsContent>
          <TabsContent value="agenda">
            <AgendaTab />
          </TabsContent>
          <TabsContent value="rapidas">
            <QuickRepliesTab />
          </TabsContent>
          <TabsContent value="respostas">
            <AutoRepliesTab />
          </TabsContent>
          {canAI && (
            <TabsContent value="revisao">
              <AiReviewsTab />
            </TabsContent>
          )}
          <TabsContent value="campaigns">
            <CampaignsTab />
          </TabsContent>
          {canAutomations && (
            <TabsContent value="automatico">
              <AutomationsTab />
            </TabsContent>
          )}
          {canWhatsapp && (
            <TabsContent value="whatsapp">
              <WhatsAppTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
