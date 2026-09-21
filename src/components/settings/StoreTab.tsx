import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSaveSetting, useSetting } from "@/hooks/useAppSettings";
import { DEFAULT_STORE, type StoreSettings } from "@/lib/storeSettings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS: { key: keyof StoreSettings; label: string; hint?: string; max: number }[] = [
  { key: "name", label: "Nome da loja", max: 80 },
  { key: "slogan", label: "Slogan", max: 120 },
  { key: "whatsapp", label: "WhatsApp", max: 40 },
  { key: "facebook", label: "Facebook", max: 80 },
  { key: "instagram", label: "Instagram", max: 80 },
  { key: "email", label: "E-mail", max: 120 },
  { key: "address", label: "Endereço", max: 200 },
  { key: "cnpj", label: "CNPJ", max: 30 },
  { key: "pixKey", label: "Chave PIX", hint: "Usada nos avisos de WhatsApp das ordens de serviço quando a chave própria da assistência estiver vazia.", max: 200 },
];

// Identidade da loja: aparece no recibo de venda, recibo de OS, orçamento, vitrine/catálogo/relatório de estoque
export function StoreTab() {
  const { data, isLoading } = useSetting<StoreSettings>("store");
  const save = useSaveSetting<StoreSettings>("store", "Dados da loja salvos.");
  const [draft, setDraft] = useState<StoreSettings>(DEFAULT_STORE);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !dirty) setDraft(data);
  }, [data, dirty]);

  const edit = (k: keyof StoreSettings, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const invalid = !draft.name.trim();

  return (
    <Card className="border shadow-none">
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Dados da loja</h2>
          <p className="text-sm text-muted-foreground">Aparecem no recibo de venda, recibo de OS, orçamento, vitrine, catálogo e relatório de estoque.</p>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className={`space-y-1 ${f.key === "address" || f.key === "pixKey" ? "sm:col-span-2" : ""}`}>
                <Label htmlFor={`store-${f.key}`}>{f.label}</Label>
                <Input id={`store-${f.key}`} value={draft[f.key]} maxLength={f.max} onChange={(e) => edit(f.key, e.target.value)} />
                {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => save.mutate(draft, { onSuccess: () => setDirty(false) })}
            disabled={save.isPending || invalid || !dirty}
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar dados da loja
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setDraft(DEFAULT_STORE);
              setDirty(true);
            }}
          >
            Restaurar padrões
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
