import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Save, Loader2, Clock, UserMinus } from "lucide-react";
import { api, Automation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const META: Record<string, { title: string; description: string; daysLabel: string; icon: typeof Clock }> = {
  pos_venda: {
    title: "Pós-venda",
    description: "Envia uma mensagem automática alguns dias após a compra.",
    daysLabel: "Dias após a venda",
    icon: Clock,
  },
  reativacao: {
    title: "Reativação de clientes",
    description: "Reativa clientes que não compram há um tempo.",
    daysLabel: "Dias sem comprar",
    icon: UserMinus,
  },
};

function AutomationCard({ automation }: { automation: Automation }) {
  const qc = useQueryClient();
  const meta = META[automation.key] ?? {
    title: automation.key,
    description: "",
    daysLabel: "Dias",
    icon: Clock,
  };
  const Icon = meta.icon;

  const [enabled, setEnabled] = useState(automation.enabled);
  const [daysAfter, setDaysAfter] = useState(String(automation.daysAfter));
  const [message, setMessage] = useState(automation.message);

  useEffect(() => {
    setEnabled(automation.enabled);
    setDaysAfter(String(automation.daysAfter));
    setMessage(automation.message);
  }, [automation]);

  const saveMut = useMutation({
    mutationFn: () =>
      api.updateAutomation(automation.key, {
        enabled,
        daysAfter: Number(daysAfter) || 0,
        message,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automação salva!");
    },
    onError: () => toast.error("Falha ao salvar."),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{meta.title}</CardTitle>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <CardDescription>{meta.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-40">
          <Label>{meta.daysLabel}</Label>
          <Input
            type="number"
            min="0"
            value={daysAfter}
            onChange={(e) => setDaysAfter(e.target.value)}
          />
        </div>
        <div>
          <Label>Mensagem</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Use {nome} para o primeiro nome do cliente"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Dica: use <code>{"{nome}"}</code> para personalizar com o nome do cliente.
          </p>
        </div>
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-2">
          {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AutomationsTab() {
  const { data: automations = [], isLoading } = useQuery({
    queryKey: ["automations"],
    queryFn: api.listAutomations,
  });

  const runMut = useMutation({
    mutationFn: api.runAutomations,
    onSuccess: (s) => {
      if (!s.whatsappConfigured) {
        toast.warning("WhatsApp não conectado — as mensagens não foram enviadas.");
      }
      toast.success(
        `Executado: pós-venda ${s.posVenda.sent}/${s.posVenda.attempted}, ` +
          `reativação ${s.reativacao.sent}/${s.reativacao.attempted}`
      );
    },
    onError: () => toast.error("Falha ao executar as automações."),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando automações...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <h3 className="font-semibold">Disparo automático</h3>
            <p className="text-sm text-muted-foreground">
              As automações habilitadas rodam sozinhas todo dia às 9h. Você também pode
              executar manualmente agora.
            </p>
          </div>
          <Button onClick={() => runMut.mutate()} disabled={runMut.isPending} className="gap-2">
            {runMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Executar agora
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {automations.map((a) => (
          <AutomationCard key={a.key} automation={a} />
        ))}
      </div>
    </div>
  );
}
