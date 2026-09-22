import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useSaveSetting, useSetting } from "@/hooks/useAppSettings";
import { DEFAULT_WARRANTY_TERMS, type WarrantyTerms } from "@/lib/warrantyTerms";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const DAY_FIELDS: { key: keyof WarrantyTerms["days"]; label: string }[] = [
  { key: "lacrado", label: "Aparelho lacrado (dias)" },
  { key: "seminovo", label: "Aparelho seminovo (dias)" },
  { key: "bateria", label: "Bateria (dias)" },
  { key: "servico", label: "Serviço de OS (dias)" },
];

const clone = (t: WarrantyTerms): WarrantyTerms => JSON.parse(JSON.stringify(t)) as WarrantyTerms;

// Prazos e texto do termo de garantia que sai no recibo de venda (blocos editáveis)
export function WarrantyTab() {
  const { data, isLoading } = useSetting<WarrantyTerms>("warranty_terms");
  const save = useSaveSetting<WarrantyTerms>("warranty_terms", "Termos de garantia salvos.");
  const [draft, setDraft] = useState<WarrantyTerms>(clone(DEFAULT_WARRANTY_TERMS));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !dirty) setDraft(clone(data));
  }, [data, dirty]);

  const edit = (fn: (d: WarrantyTerms) => void) => {
    setDraft((d) => {
      const c = clone(d);
      fn(c);
      return c;
    });
    setDirty(true);
  };
  const daysInvalid = DAY_FIELDS.some((f) => !Number.isInteger(draft.days[f.key]) || draft.days[f.key] < 0 || draft.days[f.key] > 3650);

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  }

  return (
    <Card className="border shadow-none">
      <CardContent className="space-y-6 p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Termos de garantia</h2>
          <p className="text-sm text-muted-foreground">
            Prazos e texto do termo impresso no recibo de venda. Nos textos você pode usar {"{dias_lacrado}"}, {"{dias_seminovo}"}, {"{dias_bateria}"} e {"{dias_servico}"}
            para inserir os prazos. Se mudar um prazo, ajuste o texto também. Tudo o que for digitado é tratado como texto puro.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {DAY_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`days-${f.key}`}>{f.label}</Label>
              <Input
                id={`days-${f.key}`}
                type="number"
                min={0}
                max={3650}
                value={Number.isFinite(draft.days[f.key]) ? draft.days[f.key] : ""}
                onChange={(e) => edit((d) => { d.days[f.key] = e.target.value === "" ? NaN : Number(e.target.value); })}
              />
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <Label htmlFor="w-footer">Faixa abaixo dos itens (uma linha por linha)</Label>
          <Textarea id="w-footer" rows={2} maxLength={400} value={draft.footer} onChange={(e) => edit((d) => { d.footer = e.target.value; })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="w-title">Título do termo</Label>
          <Input id="w-title" maxLength={120} value={draft.title} onChange={(e) => edit((d) => { d.title = e.target.value; })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="w-lead">Frase de abertura</Label>
          <Textarea id="w-lead" rows={2} maxLength={800} value={draft.lead} onChange={(e) => edit((d) => { d.lead = e.target.value; })} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Tópicos</Label>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => edit((d) => { if (d.bullets.length < 20) d.bullets.push(""); })}>
              <Plus className="h-3.5 w-3.5" /> Adicionar tópico
            </Button>
          </div>
          {draft.bullets.map((b, i) => (
            <div key={i} className="flex gap-2">
              <Textarea aria-label={`Tópico ${i + 1}`} rows={2} maxLength={800} value={b} onChange={(e) => edit((d) => { d.bullets[i] = e.target.value; })} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remover tópico ${i + 1}`} onClick={() => edit((d) => { d.bullets.splice(i, 1); })}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Seções (título + texto)</Label>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => edit((d) => { if (d.sections.length < 8) d.sections.push({ title: "", text: "" }); })}>
              <Plus className="h-3.5 w-3.5" /> Adicionar seção
            </Button>
          </div>
          {draft.sections.map((s, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex gap-2">
                <Input aria-label={`Título da seção ${i + 1}`} maxLength={300} value={s.title} onChange={(e) => edit((d) => { d.sections[i].title = e.target.value; })} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover seção ${i + 1}`} onClick={() => edit((d) => { d.sections.splice(i, 1); })}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Textarea aria-label={`Texto da seção ${i + 1}`} rows={3} maxLength={2000} value={s.text} onChange={(e) => edit((d) => { d.sections[i].text = e.target.value; })} />
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="w-agree">Frase de concordância</Label>
            <Input id="w-agree" maxLength={200} value={draft.agree} onChange={(e) => edit((d) => { d.agree = e.target.value; })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="w-sign">Legenda da assinatura</Label>
            <Input id="w-sign" maxLength={120} value={draft.signLabel} onChange={(e) => edit((d) => { d.signLabel = e.target.value; })} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate(draft, { onSuccess: () => setDirty(false) })} disabled={save.isPending || daysInvalid || !dirty}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar termos
          </Button>
          <Button variant="outline" onClick={() => { setDraft(clone(DEFAULT_WARRANTY_TERMS)); setDirty(true); }}>
            Restaurar textos padrão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
