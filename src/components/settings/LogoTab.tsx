import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { useSaveSetting, useSetting, useLogoSrc } from "@/hooks/useAppSettings";
import { fileToLogoDataUrl } from "@/lib/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Logo da loja (menu lateral, login, recibos, OS, orçamento, vitrine/catálogo)
export function LogoTab() {
  const { data } = useSetting<{ dataUrl: string }>("logo");
  const save = useSaveSetting<{ dataUrl: string }>("logo", "Logo salvo.");
  const current = useLogoSrc();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      setPending(await fileToLogoDataUrl(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Imagem inválida.");
      setPending(null);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const shown = pending ?? current;
  const custom = !!data?.dataUrl;

  return (
    <Card className="border shadow-none">
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Logo</h2>
          <p className="text-sm text-muted-foreground">PNG, JPG ou WEBP de até 2 MB. O navegador reduz para no máximo 512 px antes de guardar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <img src={shown} alt="Pré-visualização do logo" data-testid="logo-preview" className="h-24 w-24 rounded-full border object-cover" />
          <div className="space-y-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Escolher imagem do logo" onChange={(e) => onFile(e.target.files?.[0])} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => input.current?.click()} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Escolher imagem
              </Button>
              <Button
                onClick={() => pending && save.mutate({ dataUrl: pending }, { onSuccess: () => setPending(null) })}
                disabled={!pending || save.isPending}
              >
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar logo
              </Button>
              <Button
                variant="outline"
                disabled={(!custom && !pending) || save.isPending}
                onClick={() => save.mutate({ dataUrl: "" }, { onSuccess: () => setPending(null) })}
              >
                Restaurar logo padrão
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{pending ? "Pré-visualização (ainda não salva)." : custom ? "Usando um logo personalizado." : "Usando o logo padrão."}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
