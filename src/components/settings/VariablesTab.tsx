import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, KeyRound, Loader2, Pencil, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

// Variáveis customizadas (só administrador). Valores cifrados no servidor e mascarados aqui;
// "Mostrar valor" consulta o servidor (cada consulta fica na auditoria).
export function VariablesTab() {
  const qc = useQueryClient();
  const { data: vars = [], isLoading } = useQuery({ queryKey: ["customVars"], queryFn: api.listCustomVars });
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  const failMsg = (err: unknown, fallback: string) => toast.error(err instanceof ApiError ? err.message : fallback);

  const saveMut = useMutation({
    mutationFn: ({ n, v }: { n: string; v: string }) => api.saveCustomVar(n, v),
    onSuccess: (_r, { n }) => {
      qc.invalidateQueries({ queryKey: ["customVars"] });
      setRevealed((r) => {
        const c = { ...r };
        delete c[n];
        return c;
      });
      setName("");
      setValue("");
      toast.success(`Variável ${n} salva.`);
    },
    onError: (e) => failMsg(e, "Não foi possível salvar a variável."),
  });
  const deleteMut = useMutation({
    mutationFn: (n: string) => api.deleteCustomVar(n),
    onSuccess: (_r, n) => {
      qc.invalidateQueries({ queryKey: ["customVars"] });
      toast.success(`Variável ${n} excluída.`);
    },
    onError: (e) => failMsg(e, "Não foi possível excluir."),
  });

  const nameOk = NAME_RE.test(name);

  const toggleReveal = async (n: string) => {
    if (revealed[n] !== undefined) {
      setRevealed((r) => {
        const c = { ...r };
        delete c[n];
        return c;
      });
      return;
    }
    setRevealing(n);
    try {
      const v = await api.revealCustomVar(n);
      setRevealed((r) => ({ ...r, [n]: v }));
    } catch (e) {
      failMsg(e, "Não foi possível consultar o valor.");
    } finally {
      setRevealing(null);
    }
  };

  const copy = async (n: string) => {
    try {
      const v = revealed[n] ?? (await api.revealCustomVar(n));
      await navigator.clipboard.writeText(v);
      toast.success(`Valor de ${n} copiado.`);
    } catch (e) {
      failMsg(e, "Não foi possível copiar.");
    }
  };

  return (
    <Card className="border shadow-none">
      <CardContent className="space-y-6 p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Variáveis customizadas</h2>
          <p className="text-sm text-muted-foreground">
            Chaves e segredos de integrações (ex.: GEMINI_API_KEY). Ficam cifrados no servidor e nunca aparecem em listagens; consultar o valor fica registrado na auditoria.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="var-name">Nome</Label>
            <Input id="var-name" value={name} maxLength={64} placeholder="EXEMPLO_DE_NOME" onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} />
            {name && !nameOk && <p className="text-xs text-destructive">Comece com letra; use só MAIÚSCULAS, números e _ (2 a 64 caracteres).</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="var-value">Valor</Label>
            <Input id="var-value" type="password" autoComplete="off" value={value} maxLength={4000} onChange={(e) => setValue(e.target.value)} />
          </div>
          <Button onClick={() => saveMut.mutate({ n: name, v: value })} disabled={!nameOk || !value || saveMut.isPending} className="gap-2">
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Salvar variável
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Atualizada</TableHead>
                <TableHead className="w-52" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vars.map((v) => (
                <TableRow key={v.name} data-var={v.name}>
                  <TableCell className="font-mono text-sm">{v.name}</TableCell>
                  <TableCell className="font-mono text-sm" data-testid={`var-value-${v.name}`}>{revealed[v.name] ?? v.masked}</TableCell>
                  <TableCell className="text-xs">{new Date(v.updatedAt).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" className="gap-1" onClick={() => toggleReveal(v.name)} disabled={revealing === v.name} aria-label={revealed[v.name] !== undefined ? `Ocultar valor de ${v.name}` : `Mostrar valor de ${v.name}`}>
                        {revealing === v.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : revealed[v.name] !== undefined ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {revealed[v.name] !== undefined ? "Ocultar" : "Mostrar valor"}
                      </Button>
                      <Button variant="ghost" size="icon" title="Copiar" aria-label={`Copiar valor de ${v.name}`} onClick={() => copy(v.name)}>
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Alterar valor" aria-label={`Alterar ${v.name}`} onClick={() => { setName(v.name); setValue(""); document.getElementById("var-value")?.focus(); }}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Excluir" aria-label={`Excluir ${v.name}`} onClick={() => { if (window.confirm(`Excluir a variável ${v.name}?`)) deleteMut.mutate(v.name); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {vars.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">{isLoading ? "Carregando…" : "Nenhuma variável cadastrada."}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
