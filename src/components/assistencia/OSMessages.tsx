import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Save, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useOsMessages, useOsNotifications, useNotifyOrder } from "@/hooks/useOsMessages";
import {
  DEFAULT_OS_MESSAGES, OS_EVENTS, OS_EVENT_LABELS, OS_VARIABLES, OsMessagesSettings, renderOsMessage, OsForMessage,
} from "@/lib/osMessages";
import { COST_RESPONSIBILITIES } from "@/lib/serviceOrders";
import { NotificationStatusBadge } from "@/components/assistencia/NotificationStatusBadge";
import { NotificationStatus, OSEvent, CostResponsibility } from "@/types/serviceOrder";

// OS de exemplo para a prévia em tempo real
const SAMPLE: OsForMessage = {
  id: "a1b2c3d4-0000-4000-8000-000000000000",
  customerName: "Maria Souza Lima",
  model: "iPhone 14 Pro",
  color: "Preto Espacial",
  serialImei: "356789012345678",
  chargedAmount: 450,
  costResponsibility: "Cliente",
};

export default function OSMessages() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { settings, loaded, save } = useOsMessages();
  const [draft, setDraft] = useState<OsMessagesSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const [simResp, setSimResp] = useState<CostResponsibility>("Cliente");
  const [active, setActive] = useState<OSEvent>("pronto_retirada");
  const areas = useRef<Partial<Record<OSEvent, HTMLTextAreaElement | null>>>({});

  // Carrega o que veio do servidor (sem sobrescrever edição em andamento)
  useEffect(() => {
    if (loaded && !dirty) setDraft(settings);
  }, [loaded, settings, dirty]);

  const edit = (patch: Partial<OsMessagesSettings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const setTemplate = (ev: OSEvent, value: string) => edit({ templates: { ...draft.templates, [ev]: value } });

  // Insere a variável no ponto do cursor do modelo em foco
  const insertVar = (key: string) => {
    const ta = areas.current[active];
    const text = `{${key}}`;
    const cur = draft.templates[active];
    if (!ta) return setTemplate(active, cur + text);
    const start = ta.selectionStart ?? cur.length;
    const end = ta.selectionEnd ?? cur.length;
    setTemplate(active, cur.slice(0, start) + text + cur.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const sample: OsForMessage = {
    ...SAMPLE,
    costResponsibility: simResp,
    chargedAmount: simResp === "Garantia da Loja" || simResp === "Cortesia / Loja" ? 0 : simResp === "Dividido / Co-participação" ? 200 : 450,
  };

  const invalid = OS_EVENTS.some((ev) => !draft.templates[ev].trim()) || !draft.storeName.trim();
  const handleSave = () => save.mutate(draft, { onSuccess: () => setDirty(false) });
  const handleReset = () => {
    setDraft({ ...DEFAULT_OS_MESSAGES, pixKey: draft.pixKey, includePixKey: draft.includePixKey, storeName: draft.storeName });
    setDirty(true);
  };

  return (
    <div className="space-y-6">
      {isAdmin ? (
        <Card className="border shadow-none">
          <CardContent className="space-y-6 p-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">Mensagens automáticas de WhatsApp</h2>
              <p className="text-sm text-muted-foreground">
                Edite o texto enviado ao cliente em cada etapa. As variáveis entre chaves são trocadas pelos dados da OS.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Variáveis (clique para inserir no modelo selecionado)</Label>
              <div className="flex flex-wrap gap-2" data-testid="os-vars">
                {OS_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    title={v.description}
                    onClick={() => insertVar(v.key)}
                    className="rounded-md border bg-muted px-2 py-1 font-mono text-xs hover:bg-accent"
                  >
                    {`{${v.key}}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="store-name">Nome da loja ({"{loja}"})</Label>
                <Input id="store-name" value={draft.storeName} maxLength={80} onChange={(e) => edit({ storeName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pix-key">Chave PIX ({"{chave_pix}"})</Label>
                <Input id="pix-key" value={draft.pixKey} maxLength={200} onChange={(e) => edit({ pixKey: e.target.value })} placeholder="CPF, e-mail, telefone ou chave aleatória" />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch id="include-pix" checked={draft.includePixKey} onCheckedChange={(v) => edit({ includePixKey: v })} aria-label="Incluir chave PIX nas mensagens" />
                <Label htmlFor="include-pix">Incluir chave PIX</Label>
              </div>
            </div>
            <p className="-mt-3 text-xs text-muted-foreground">
              A linha do modelo que contém {"{chave_pix}"} some sozinha quando a chave está desligada, vazia ou quando a OS é isenta (garantia/cortesia).
            </p>

            <div className="flex items-center gap-2">
              <Label>Simular na prévia</Label>
              <Select value={simResp} onValueChange={(v) => setSimResp(v as CostResponsibility)}>
                <SelectTrigger className="w-64" aria-label="Simular quem paga"><SelectValue /></SelectTrigger>
                <SelectContent>{COST_RESPONSIBILITIES.map((c) => <SelectItem key={c} value={c}>Quem paga: {c}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="grid gap-6 lg:grid-cols-1">
              {OS_EVENTS.map((ev) => (
                <div key={ev} className="grid gap-4 rounded-lg border p-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`tpl-${ev}`} className="font-semibold">{OS_EVENT_LABELS[ev]}</Label>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`en-${ev}`} className="text-xs text-muted-foreground">Enviar automaticamente</Label>
                        <Switch
                          id={`en-${ev}`}
                          aria-label={`Enviar automaticamente: ${OS_EVENT_LABELS[ev]}`}
                          checked={draft.enabled[ev]}
                          onCheckedChange={(v) => edit({ enabled: { ...draft.enabled, [ev]: v } })}
                        />
                      </div>
                    </div>
                    <Textarea
                      id={`tpl-${ev}`}
                      aria-label={`Modelo: ${OS_EVENT_LABELS[ev]}`}
                      ref={(el) => { areas.current[ev] = el; }}
                      value={draft.templates[ev]}
                      rows={6}
                      maxLength={1000}
                      onFocus={() => setActive(ev)}
                      onChange={(e) => setTemplate(ev, e.target.value)}
                    />
                    {!draft.templates[ev].trim() && <p className="text-xs text-destructive">O modelo não pode ficar vazio.</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Prévia (OS de exemplo)</Label>
                    <div
                      className="whitespace-pre-line rounded-lg bg-muted p-3 text-sm"
                      data-testid={`preview-${ev}`}
                    >
                      {renderOsMessage(draft.templates[ev], sample, draft) || "—"}
                    </div>
                    {!draft.enabled[ev] && <Badge variant="secondary">Envio automático desligado (só manual)</Badge>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleReset} className="gap-2"><RotateCcw className="h-4 w-4" /> Restaurar modelos padrão</Button>
              <Button onClick={handleSave} disabled={!dirty || invalid || save.isPending} className="gap-2">
                <Save className="h-4 w-4" /> {save.isPending ? "Salvando..." : "Salvar mensagens"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Os modelos de mensagem são editados pelo administrador. Abaixo você acompanha o histórico de avisos enviados aos clientes.
          </CardContent>
        </Card>
      )}

      <NotificationsHistory />
    </div>
  );
}

function NotificationsHistory() {
  const [status, setStatus] = useState<"all" | NotificationStatus>("all");
  const { data = [], isLoading } = useOsNotifications(status === "all" ? undefined : status);
  const notify = useNotifyOrder();

  return (
    <Card className="border shadow-none">
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Histórico de avisos</h2>
          <Select value={status} onValueChange={(v) => setStatus(v as "all" | NotificationStatus)}>
            <SelectTrigger className="w-44" aria-label="Filtrar avisos por status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="sent">Enviados</SelectItem>
              <SelectItem value="failed">Com falha</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>OS</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Aviso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detalhe</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Carregando…</TableCell></TableRow>
              )}
              {!isLoading && data.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum aviso registrado ainda.</TableCell></TableRow>
              )}
              {data.map((n) => (
                <TableRow key={n.id} data-testid="notif-row">
                  <TableCell className="whitespace-nowrap text-xs">{format(n.createdAt, "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell className="font-mono text-xs">{n.osId.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell className="text-sm">{n.customerName} <span className="text-xs text-muted-foreground">· {n.model}</span></TableCell>
                  <TableCell className="text-sm">{OS_EVENT_LABELS[n.event]}</TableCell>
                  <TableCell><NotificationStatusBadge status={n.status} /></TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground" title={n.error ?? ""}>{n.error ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {n.status !== "sent" && (
                      <Button size="sm" variant="ghost" disabled={notify.isPending} onClick={() => notify.mutate({ osId: n.osId, event: n.event })}>
                        Reenviar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
