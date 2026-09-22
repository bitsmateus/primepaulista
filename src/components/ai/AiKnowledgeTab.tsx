import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useAiDocuments } from "@/hooks/useAI";
import type { AiDocumentRow } from "@/lib/api";
import {
  DOC_CATEGORIES, DOC_CATEGORY_LABELS, MAX_DOC_CHARS, chunkText, estimateTokens, normalizeText, retrieve,
  type DocCategory,
} from "@/lib/aiRetrieval";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Draft {
  title: string;
  category: DocCategory;
  content: string;
  tagsText: string;
  active: boolean;
  fileName: string | null;
}
const EMPTY: Draft = { title: "", category: "OUTRO", content: "", tagsText: "", active: true, fileName: null };
const parseTags = (t: string) => [...new Set(t.split(",").map((x) => x.trim()).filter(Boolean))];
const MAX_FILE_BYTES = 200_000;

// Base de conhecimento: documentos que a IA consulta (só os ATIVOS)
export function AiKnowledgeTab() {
  const { documents, isLoading, create, update, remove } = useAiDocuments();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AiDocumentRow | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<AiDocumentRow | null>(null);
  const [testQuery, setTestQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const q = normalizeText(search);
    if (!q) return documents;
    return documents.filter((d) => normalizeText(`${d.title} ${d.tags.join(" ")} ${d.category} ${d.content}`).includes(q));
  }, [documents, search]);

  const activeTokens = documents.filter((d) => d.active).reduce((s, d) => s + d.tokenEstimate, 0);
  const tests = useMemo(
    () => (testQuery.trim() ? retrieve(testQuery, documents.map((d) => ({ id: d.id, title: d.title, category: d.category, tags: d.tags, content: d.content, active: d.active })), { k: 4 }) : null),
    [testQuery, documents]
  );

  const openNew = () => { setDraft(EMPTY); setEditing("new"); };
  const openEdit = (d: AiDocumentRow) => {
    setDraft({ title: d.title, category: (DOC_CATEGORIES.includes(d.category as DocCategory) ? d.category : "OUTRO") as DocCategory, content: d.content, tagsText: d.tags.join(", "), active: d.active, fileName: d.fileName });
    setEditing(d);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) { toast.error("Envie um arquivo .txt ou .md."); return; }
    if (file.size > MAX_FILE_BYTES) { toast.error("O arquivo passa de 200 KB. Divida em partes menores."); return; }
    try {
      const text = (await file.text()).replace(/^\uFEFF/, "");
      if (text.length > MAX_DOC_CHARS) { toast.error("O arquivo passa de 200 KB. Divida em partes menores."); return; }
      setDraft((d) => ({ ...d, content: text, fileName: file.name, title: d.title.trim() ? d.title : file.name.replace(/\.(txt|md)$/i, "") }));
      toast.success(`Arquivo “${file.name}” carregado.`);
    } catch {
      toast.error("Não foi possível ler o arquivo.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    if (!draft.title.trim()) { toast.error("Informe o título do documento."); return; }
    if (!draft.content.trim()) { toast.error("O documento está vazio: cole o texto ou envie um arquivo."); return; }
    if (draft.content.length > MAX_DOC_CHARS) { toast.error("O documento passa de 200 KB."); return; }
    const input = { title: draft.title.trim(), category: draft.category, content: draft.content, tags: parseTags(draft.tagsText), active: draft.active, fileName: draft.fileName };
    try {
      if (editing === "new") await create.mutateAsync(input);
      else if (editing) await update.mutateAsync({ id: editing.id, patch: input });
      toast.success(editing === "new" ? "Documento criado." : "Documento salvo.");
      setEditing(null);
    } catch {
      /* onError do hook avisa */
    }
  };

  const chunks = chunkText(draft.content).length;

  return (
    <div className="space-y-4" data-testid="ai-knowledge">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Buscar documentos" className="pl-8" placeholder="Buscar por título, etiqueta ou conteúdo" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Badge variant="outline" data-testid="kb-total-tokens">{documents.filter((d) => d.active).length} ativo(s) · ~{activeTokens.toLocaleString("pt-BR")} tokens</Badge>
        <Button className="gap-1" onClick={openNew}><Plus className="h-4 w-4" /> Novo documento</Button>
      </div>
      <p className="text-xs text-muted-foreground">Só documentos <strong>ativos</strong> são consultados. A IA recebe apenas os trechos mais parecidos com a pergunta (não o documento inteiro). Não cole dados pessoais de clientes nem custos.</p>

      <div className="space-y-2" data-testid="kb-list">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando documentos…</p>}
        {!isLoading && documents.length === 0 && (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground" data-testid="kb-empty">
            Nenhum documento ainda. Crie um com o texto da sua política de garantia, formas de pagamento, endereço e horário, manuais…
          </p>
        )}
        {!isLoading && documents.length > 0 && shown.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhum documento encontrado.</p>}
        {shown.map((d) => (
          <Card key={d.id} className={`border shadow-none ${d.active ? "" : "opacity-60"}`} data-testid="kb-doc" data-doc={d.title}>
            <CardContent className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{d.title}</p>
                  <Badge variant="outline" className="text-xs">{DOC_CATEGORY_LABELS[d.category as DocCategory] ?? d.category}</Badge>
                  {d.tags.map((t) => <Badge key={t} variant="secondary" className="text-xs font-normal">{t}</Badge>)}
                  {!d.active && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{d.content.slice(0, 160)}</p>
                <p className="text-xs text-muted-foreground">
                  ~{d.tokenEstimate.toLocaleString("pt-BR")} tokens · {chunkText(d.content).length} trecho(s){d.fileName ? ` · arquivo ${d.fileName}` : ""}
                </p>
              </div>
              <Switch checked={d.active} aria-label={`Ativar documento ${d.title}`} onCheckedChange={(v) => update.mutate({ id: d.id, patch: { active: v } }, { onSuccess: () => toast.success(v ? "Documento ativado." : "Documento desativado.") })} />
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar ${d.title}`} onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Excluir ${d.title}`} onClick={() => setDeleteTarget(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border shadow-none" data-testid="kb-test">
        <CardHeader className="pb-2"><CardTitle className="text-base">Testar busca</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">Digite uma pergunta de cliente e veja quais trechos a IA receberia (usa a mesma busca do servidor, só nos documentos ativos).</p>
          <Input aria-label="Pergunta para testar a busca" placeholder="Ex.: qual a garantia de um seminovo?" value={testQuery} onChange={(e) => setTestQuery(e.target.value)} />
          {tests && tests.length === 0 && <p className="text-sm text-muted-foreground" data-testid="kb-test-empty">Nenhum trecho relevante encontrado.</p>}
          {tests?.map((h, i) => (
            <div key={`${h.docId}-${h.chunkIndex}`} className="rounded-md border p-2 text-sm" data-testid="kb-test-hit">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold">{i + 1}. {h.title}</span>
                <Badge variant="outline" className="text-xs">nota {h.score.toFixed(2)}</Badge>
                <span className="text-muted-foreground">trecho {h.chunkIndex + 1}</span>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{h.text}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo documento" : "Editar documento"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="kb-title">Título</Label>
                <Input id="kb-title" aria-label="Título do documento" maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v as DocCategory })}>
                  <SelectTrigger aria-label="Categoria do documento"><SelectValue /></SelectTrigger>
                  <SelectContent>{DOC_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{DOC_CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="kb-tags">Etiquetas (separadas por vírgula)</Label>
              <Input id="kb-tags" aria-label="Etiquetas do documento" placeholder="garantia, bateria, troca" value={draft.tagsText} onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">Etiquetas ajudam a achar o documento. Dica: uma política de <strong>troca</strong> com faixas de valores precisa da etiqueta <code>troca</code> para a IA poder citá-las.</p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="kb-content">Conteúdo</Label>
                <div>
                  <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" aria-label="Enviar arquivo .txt ou .md" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> Enviar arquivo (.txt / .md)</Button>
                </div>
              </div>
              <Textarea id="kb-content" aria-label="Conteúdo do documento" rows={10} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value, fileName: draft.fileName })} placeholder="Cole aqui o texto (até 200 KB)…" />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span data-testid="kb-estimate">~{estimateTokens(draft.content).toLocaleString("pt-BR")} tokens · {chunks} trecho(s) · {draft.content.length.toLocaleString("pt-BR")} de {MAX_DOC_CHARS.toLocaleString("pt-BR")} caracteres</span>
                {draft.fileName && (
                  <span className="inline-flex items-center gap-1">Arquivo: {draft.fileName}
                    <button type="button" aria-label="Remover nome do arquivo" onClick={() => setDraft({ ...draft, fileName: null })}><X className="h-3 w-3" /></button>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="kb-active" aria-label="Documento ativo" checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
              <Label htmlFor="kb-active">Ativo (a IA pode consultar)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>Salvar documento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>“{deleteTarget?.title}” será removido da base de conhecimento. Para só parar de usar, desative em vez de excluir.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && remove.mutate(deleteTarget.id, { onSuccess: () => toast.success("Documento excluído.") })}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
