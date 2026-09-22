import { Bot, BookOpen, FlaskConical, BarChart3, SlidersHorizontal } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiStatusBanner } from "@/components/ai/AiBits";
import { AiConfigTab } from "@/components/ai/AiConfigTab";
import { AiKnowledgeTab } from "@/components/ai/AiKnowledgeTab";
import { AiPlaygroundTab } from "@/components/ai/AiPlaygroundTab";
import { AiMetricsTab } from "@/components/ai/AiMetricsTab";

// IA no Atendimento (Gemini): configuração, base de conhecimento, simulador e métricas.
// Acesso: capacidade manageAI (administrador e gerente). A fila de revisão fica no CRM (aba "Revisão da IA").
export default function IAPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground"><Bot className="h-6 w-6" /> IA no Atendimento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O Gemini sugere e (se você deixar) envia respostas no WhatsApp usando a sua base de conhecimento, o estoque real e as regras (guardrails) abaixo.
            As respostas que precisam de um humano ficam em <strong>CRM › Revisão da IA</strong>.
          </p>
        </div>
        <AiStatusBanner />
        <Tabs defaultValue="config" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="config" className="gap-2"><SlidersHorizontal className="h-4 w-4" /> Configuração</TabsTrigger>
            <TabsTrigger value="base" className="gap-2"><BookOpen className="h-4 w-4" /> Base de conhecimento</TabsTrigger>
            <TabsTrigger value="simulador" className="gap-2"><FlaskConical className="h-4 w-4" /> Simulador</TabsTrigger>
            <TabsTrigger value="metricas" className="gap-2"><BarChart3 className="h-4 w-4" /> Métricas</TabsTrigger>
          </TabsList>
          <TabsContent value="config"><AiConfigTab /></TabsContent>
          <TabsContent value="base"><AiKnowledgeTab /></TabsContent>
          <TabsContent value="simulador"><AiPlaygroundTab /></TabsContent>
          <TabsContent value="metricas"><AiMetricsTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
