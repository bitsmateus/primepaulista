import { Store, Image, ScrollText, ShieldCheck, KeyRound, Database } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StoreTab } from "@/components/settings/StoreTab";
import { LogoTab } from "@/components/settings/LogoTab";
import { WarrantyTab } from "@/components/settings/WarrantyTab";
import { SecurityTab } from "@/components/settings/SecurityTab";
import { VariablesTab } from "@/components/settings/VariablesTab";
import { BackupTab } from "@/components/settings/BackupTab";

// Configurações e identidade da loja. Loja/Logo/Termos/Segurança: quem tem editSettings (admin, gerente).
// Variáveis e Backup: só quem tem manageSecrets (admin).
export default function SettingsPage() {
  const { user } = useAuth();
  const secrets = can(user?.role, "manageSecrets");

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
          <p className="mt-1 text-sm text-muted-foreground">Identidade da loja, termos de garantia, segurança{secrets ? ", variáveis e backup" : ""}</p>
        </div>

        <Tabs defaultValue="loja" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="loja" className="gap-2"><Store className="h-4 w-4" /> Loja</TabsTrigger>
            <TabsTrigger value="logo" className="gap-2"><Image className="h-4 w-4" /> Logo</TabsTrigger>
            <TabsTrigger value="termos" className="gap-2"><ScrollText className="h-4 w-4" /> Termos de garantia</TabsTrigger>
            <TabsTrigger value="seguranca" className="gap-2"><ShieldCheck className="h-4 w-4" /> Segurança</TabsTrigger>
            {secrets && <TabsTrigger value="variaveis" className="gap-2"><KeyRound className="h-4 w-4" /> Variáveis</TabsTrigger>}
            {secrets && <TabsTrigger value="backup" className="gap-2"><Database className="h-4 w-4" /> Backup</TabsTrigger>}
          </TabsList>
          <TabsContent value="loja"><StoreTab /></TabsContent>
          <TabsContent value="logo"><LogoTab /></TabsContent>
          <TabsContent value="termos"><WarrantyTab /></TabsContent>
          <TabsContent value="seguranca"><SecurityTab /></TabsContent>
          {secrets && <TabsContent value="variaveis"><VariablesTab /></TabsContent>}
          {secrets && <TabsContent value="backup"><BackupTab /></TabsContent>}
        </Tabs>
      </div>
    </AppLayout>
  );
}
