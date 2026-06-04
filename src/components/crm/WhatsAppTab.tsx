import { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw, Power, QrCode, Save, Loader2 } from "lucide-react";
import { useCRMContext } from "@/contexts/CRMContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function WhatsAppTab() {
  const {
    uazapiConfig, saveConfig, loadConfig, fetchQrCode,
    checkStatus, disconnectInstance, restartInstance,
    connectionStatus, qrCode, setConnectionStatus,
  } = useCRMContext();

  const [apiKey, setApiKey] = useState(uazapiConfig.apiKey);
  const [instanceUrl, setInstanceUrl] = useState(uazapiConfig.instanceUrl);
  const [instanceName, setInstanceName] = useState(uazapiConfig.instanceName);
  const [loading, setLoading] = useState(false);

  // Preenche os campos quando a config chega do banco
  useEffect(() => {
    setApiKey(uazapiConfig.apiKey);
    setInstanceUrl(uazapiConfig.instanceUrl);
    setInstanceName(uazapiConfig.instanceName);
  }, [uazapiConfig]);

  const handleSave = () => {
    if (!apiKey.trim() || !instanceUrl.trim() || !instanceName.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    saveConfig({ apiKey, instanceUrl, instanceName });
    toast.success("Configuração salva!");
  };

  const handleGenerateQR = async () => {
    if (!uazapiConfig.apiKey) {
      toast.error("Salve a configuração primeiro");
      return;
    }
    setLoading(true);
    try {
      await fetchQrCode();
      toast.success("QR Code gerado!");
    } catch (e: any) {
      toast.error("Erro ao gerar QR Code: " + (e.message || "Verifique as credenciais"));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!uazapiConfig.apiKey) {
      toast.error("Salve a configuração primeiro");
      return;
    }
    setLoading(true);
    try {
      const status = await checkStatus();
      toast.info(`Status: ${status}`);
    } catch {
      toast.error("Erro ao verificar status");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await disconnectInstance();
      toast.success("Instância desconectada");
    } catch {
      toast.error("Erro ao desconectar");
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      await restartInstance();
      toast.success("Instância reiniciando...");
    } catch {
      toast.error("Erro ao reiniciar");
    } finally {
      setLoading(false);
    }
  };

  const statusConfig = {
    connected: { color: "bg-green-500", label: "Conectado", textColor: "text-green-700", bgLight: "bg-green-50 border-green-200" },
    disconnected: { color: "bg-red-500", label: "Desconectado", textColor: "text-red-700", bgLight: "bg-red-50 border-red-200" },
    connecting: { color: "bg-yellow-500", label: "Conectando...", textColor: "text-yellow-700", bgLight: "bg-yellow-50 border-yellow-200" },
  };

  const currentStatus = statusConfig[connectionStatus];

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card className={`border-2 ${currentStatus.bgLight}`}>
        <CardContent className="flex items-center justify-between py-6">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-full ${currentStatus.color}/10`}>
              {connectionStatus === "connected" ? (
                <Wifi className={`h-7 w-7 ${currentStatus.textColor}`} />
              ) : connectionStatus === "connecting" ? (
                <Loader2 className={`h-7 w-7 ${currentStatus.textColor} animate-spin`} />
              ) : (
                <WifiOff className={`h-7 w-7 ${currentStatus.textColor}`} />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Status WhatsApp</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`h-2.5 w-2.5 rounded-full ${currentStatus.color}`} />
                <span className={`text-sm font-medium ${currentStatus.textColor}`}>{currentStatus.label}</span>
              </div>
              {uazapiConfig.instanceName && (
                <p className="text-xs text-muted-foreground mt-0.5">Instância: {uazapiConfig.instanceName}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCheckStatus} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-1" /> Verificar
            </Button>
            {connectionStatus === "connected" && (
              <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={loading}>
                <Power className="h-4 w-4 mr-1" /> Desconectar
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleRestart} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-1" /> Reiniciar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Config Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configuração Uazapi</CardTitle>
            <CardDescription>Insira as credenciais da sua instância</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>URL da Instância</Label>
              <Input
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                placeholder="https://sua-instancia.uazapi.com"
              />
            </div>
            <div>
              <Label>Nome da Instância</Label>
              <Input
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder="minha-instancia"
              />
            </div>
            <div>
              <Label>API Key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Sua chave de API"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1">
                <Save className="h-4 w-4 mr-1" /> Salvar Configuração
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* QR Code Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Conectar via QR Code</CardTitle>
            <CardDescription>Escaneie o código com o WhatsApp do número desejado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex aspect-square max-h-[280px] items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
              {qrCode ? (
                <img src={qrCode} alt="QR Code WhatsApp" className="max-h-full max-w-full p-4" />
              ) : (
                <div className="text-center text-muted-foreground">
                  <QrCode className="mx-auto h-16 w-16 mb-3 opacity-30" />
                  <p className="text-sm">Clique abaixo para gerar o QR Code</p>
                </div>
              )}
            </div>
            <Button
              className="w-full"
              onClick={handleGenerateQR}
              disabled={loading || !uazapiConfig.apiKey}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando...</>
              ) : (
                <><QrCode className="h-4 w-4 mr-1" /> Gerar QR Code</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
