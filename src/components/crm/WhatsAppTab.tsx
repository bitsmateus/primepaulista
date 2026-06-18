import { useState } from "react";
import { Wifi, WifiOff, RefreshCw, Power, QrCode, Plus, Loader2, Trash2, Check } from "lucide-react";
import { useCRMContext } from "@/contexts/CRMContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function WhatsAppTab() {
  const {
    instances, selectedInstanceId, setSelectedInstanceId,
    createInstance, updateInstance, deleteInstance,
    fetchQrCode, checkStatus, disconnectInstance, restartInstance,
    connectionStatus, qrCode,
  } = useCRMContext();

  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [apiKey, setApiKey] = useState("");

  const selected = instances.find((i) => i.id === selectedInstanceId) ?? null;

  const openCreate = () => {
    setEditingId(null); setName(""); setInstanceUrl(""); setInstanceName(""); setApiKey("");
    setShowForm(true);
  };
  const openEdit = (id: string) => {
    const i = instances.find((x) => x.id === id);
    if (!i) return;
    setEditingId(id); setName(i.name); setInstanceUrl(i.instanceUrl); setInstanceName(i.instanceName); setApiKey("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !instanceUrl.trim()) { toast.error("Preencha nome e URL da instância"); return; }
    if (!editingId && !apiKey.trim()) { toast.error("Informe a API Key"); return; }
    try {
      if (editingId) {
        await updateInstance(editingId, { name, instanceUrl, instanceName, apiKey });
      } else {
        const created = await createInstance({ name, instanceUrl, instanceName, apiKey });
        setSelectedInstanceId(created.id);
      }
      toast.success("Instância salva!");
      setShowForm(false);
    } catch {
      /* onError do hook avisa */
    }
  };

  const withLoading = async (fn: () => Promise<unknown>, okMsg?: string, errMsg?: string) => {
    if (!selected) return;
    setLoading(true);
    try { await fn(); if (okMsg) toast.success(okMsg); }
    catch (e: unknown) { toast.error(errMsg || (e instanceof Error ? e.message : "Erro")); }
    finally { setLoading(false); }
  };

  const statusConfig = {
    connected: { color: "bg-green-500", label: "Conectado", textColor: "text-green-700", bgLight: "bg-green-50 border-green-200" },
    disconnected: { color: "bg-red-500", label: "Desconectado", textColor: "text-red-700", bgLight: "bg-red-50 border-red-200" },
    connecting: { color: "bg-yellow-500", label: "Conectando...", textColor: "text-yellow-700", bgLight: "bg-yellow-50 border-yellow-200" },
  };
  const cur = statusConfig[connectionStatus];

  return (
    <div className="space-y-6">
      {/* Lista de instâncias */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Números de WhatsApp</CardTitle>
            <CardDescription>Cada um vê os seus e também os dos outros</CardDescription>
          </div>
          <Button onClick={openCreate} className="gap-1"><Plus className="h-4 w-4" /> Novo número</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {instances.length === 0 && <p className="text-sm text-muted-foreground">Nenhum número cadastrado ainda.</p>}
          {instances.map((i) => (
            <div
              key={i.id}
              className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${i.id === selectedInstanceId ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
              onClick={() => setSelectedInstanceId(i.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{i.name}</p>
                  {i.mine && <Badge variant="secondary" className="text-xs">Minha</Badge>}
                  {!i.configured && <Badge variant="outline" className="text-xs">Sem credenciais</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{i.instanceName || i.instanceUrl} {i.ownerName ? `· ${i.ownerName}` : ""}</p>
              </div>
              {i.id === selectedInstanceId && <Check className="h-4 w-4 text-primary" />}
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(i.id); }}>
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); deleteInstance(i.id); }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {selected && (
        <>
          {/* Status do número selecionado */}
          <Card className={`border-2 ${cur.bgLight}`}>
            <CardContent className="flex items-center justify-between py-6">
              <div className="flex items-center gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-full ${cur.color}/10`}>
                  {connectionStatus === "connected" ? <Wifi className={`h-7 w-7 ${cur.textColor}`} />
                    : connectionStatus === "connecting" ? <Loader2 className={`h-7 w-7 ${cur.textColor} animate-spin`} />
                    : <WifiOff className={`h-7 w-7 ${cur.textColor}`} />}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{selected.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`h-2.5 w-2.5 rounded-full ${cur.color}`} />
                    <span className={`text-sm font-medium ${cur.textColor}`}>{cur.label}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={loading || !selected.configured}
                  onClick={() => withLoading(() => checkStatus(selected.id))}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Verificar
                </Button>
                {connectionStatus === "connected" && (
                  <Button variant="destructive" size="sm" disabled={loading}
                    onClick={() => withLoading(() => disconnectInstance(selected.id), "Desconectado")}>
                    <Power className="h-4 w-4 mr-1" /> Desconectar
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled={loading}
                  onClick={() => withLoading(() => restartInstance(selected.id), "Reiniciando...")}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Reiniciar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* QR Code */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Conectar via QR Code</CardTitle>
              <CardDescription>Escaneie com o WhatsApp do número desejado</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex aspect-square max-h-[280px] items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
                {qrCode ? <img src={qrCode} alt="QR Code WhatsApp" className="max-h-full max-w-full p-4" /> : (
                  <div className="text-center text-muted-foreground">
                    <QrCode className="mx-auto h-16 w-16 mb-3 opacity-30" />
                    <p className="text-sm">Clique abaixo para gerar o QR Code</p>
                  </div>
                )}
              </div>
              <Button className="w-full" disabled={loading || !selected.configured}
                onClick={() => withLoading(() => fetchQrCode(selected.id), "QR Code gerado!", "Erro ao gerar QR Code")}>
                {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando...</> : <><QrCode className="h-4 w-4 mr-1" /> Gerar QR Code</>}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Form criar/editar instância */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Editar número" : "Novo número de WhatsApp"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome (identificação)</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Vendas, Suporte" /></div>
            <div><Label>URL da Instância</Label><Input value={instanceUrl} onChange={(e) => setInstanceUrl(e.target.value)} placeholder="https://sua-instancia.uazapi.com" /></div>
            <div><Label>Nome da Instância</Label><Input value={instanceName} onChange={(e) => setInstanceName(e.target.value)} placeholder="minha-instancia" /></div>
            <div>
              <Label>API Key {editingId && <span className="text-xs text-muted-foreground">(deixe em branco para manter)</span>}</Label>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Sua chave de API" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSave}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
