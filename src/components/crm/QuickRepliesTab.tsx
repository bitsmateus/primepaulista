import { useMemo, useState } from "react";
import { Copy, MessageSquareText, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCRMContext } from "@/contexts/CRMContext";
import { useQuickReplies } from "@/hooks/useCRMExtras";
import { useStoreSnapshot } from "@/hooks/useAppSettings";
import { REPLY_VARIABLES, renderReplyTemplate } from "@/lib/crmText";
import type { QuickReply } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const QUICK_REPLY_CATEGORIES = ["Boas-vindas", "Preço", "Garantia", "Endereço", "Pagamento", "Troca", "Orçamento", "Pós-venda", "Outro"];

const SAMPLE_LEAD = { id: "__exemplo", name: "Maria Souza", modelInterest: "iPhone 15 Pro" };

export default function QuickRepliesTab() {
  const { quickReplies, isLoading, create, update, remove, canManage } = useQuickReplies();
  const { leads } = useCRMContext();
  const store = useStoreSnapshot();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<QuickReply | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [cat, setCat] = useState("Outro");
  const [body, setBody] = useState("");
  const [active, setActive] = useState(true);
  const [previewLead, setPreviewLead] = useState(SAMPLE_LEAD.id);
  const [deleteTarget, setDeleteTarget] = useState<QuickReply | null>(null);

  const categories = useMemo(
    () => [...new Set([...QUICK_REPLY_CATEGORIES, ...quickReplies.map((q) => q.category)])],
    [quickReplies]
  );
  const shown = quickReplies.filter(
    (q) =>
      (category === "all" || q.category === category) &&
      (!search.trim() || `${q.title} ${q.body}`.toLowerCase().includes(search.trim().toLowerCase()))
  );

  const openNew = () => {
    setTitle(""); setCat("Outro"); setBody(""); setActive(true); setPreviewLead(SAMPLE_LEAD.id);
    setEditing("new");
  };
  const openEdit = (q: QuickReply) => {
    setTitle(q.title); setCat(q.category); setBody(q.body); setActive(q.active); setPreviewLead(SAMPLE_LEAD.id);
    setEditing(q);
  };

  const lead = previewLead === SAMPLE_LEAD.id ? SAMPLE_LEAD : leads.find((l) => l.id === previewLead) ?? SAMPLE_LEAD;
  const preview = renderReplyTemplate(body, {
    name: lead.name, model: lead.modelInterest, storeName: store.name, address: store.address, pixKey: store.pixKey,
  });

  const save = async () => {
    if (!title.trim() || !body.trim()) { toast.error("Preencha o título e o texto."); return; }
    const input = { title: title.trim(), body: body.trim(), category: cat.trim() || "Outro", active };
    try {
      if (editing === "new") await create.mutateAsync(input);
      else if (editing) await update.mutateAsync({ id: editing.id, patch: input });
      toast.success(editing === "new" ? "Resposta criada." : "Resposta salva.");
      setEditing(null);
    } catch {
      /* onError do hook avisa */
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border shadow-none">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <h3 className="font-semibold">Respostas rápidas</h3>
            <p className="text-sm text-muted-foreground">
              Modelos de mensagem prontos. Na conversa do lead, o botão <strong>Respostas rápidas</strong> insere o texto já com o nome, o modelo e os dados da loja.
            </p>
          </div>
          {canManage && (
            <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Nova resposta</Button>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar resposta rápida" placeholder="Buscar resposta..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48" aria-label="Filtrar respostas por categoria"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando respostas…</p>}
      {!isLoading && shown.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma resposta encontrada.</p>
      )}

      <div className="grid gap-3 md:grid-cols-2" data-testid="quick-reply-list">
        {shown.map((q) => (
          <Card key={q.id} className={`border shadow-none ${q.active ? "" : "opacity-60"}`} data-testid="quick-reply-card">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start gap-2">
                <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{q.title}</p>
                  <Badge variant="outline" className="mt-1 text-xs">{q.category}</Badge>
                  {!q.active && <Badge variant="secondary" className="ml-1 mt-1 text-xs">Inativa</Badge>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar ${q.title}`} onClick={() => openEdit(q)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Excluir ${q.title}`} onClick={() => setDeleteTarget(q)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{q.body}</p>
              <Button
                size="sm" variant="outline" className="gap-1"
                onClick={() => {
                  const txt = renderReplyTemplate(q.body, { name: SAMPLE_LEAD.name, model: SAMPLE_LEAD.modelInterest, storeName: store.name, address: store.address, pixKey: store.pixKey });
                  navigator.clipboard?.writeText(txt).then(() => toast.success("Texto copiado (com um lead de exemplo)."), () => toast.error("Não foi possível copiar."));
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copiar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing === "new" ? "Nova resposta rápida" : "Editar resposta rápida"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <Label htmlFor="qr-title">Título</Label>
                <Input id="qr-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Ex.: Endereço da loja" />
              </div>
              <div>
                <Label htmlFor="qr-cat">Categoria</Label>
                <Input id="qr-cat" list="qr-cats" value={cat} onChange={(e) => setCat(e.target.value)} maxLength={40} />
                <datalist id="qr-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <Label htmlFor="qr-body">Texto</Label>
                <Textarea id="qr-body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={1500} placeholder="Olá, {primeiro_nome}!" />
                <div className="mt-2 flex flex-wrap gap-1">
                  {REPLY_VARIABLES.map((v) => (
                    <button
                      key={v.key} type="button" title={v.description}
                      className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                      onClick={() => setBody((b) => `${b}{${v.key}}`)}
                    >
                      {`{${v.key}}`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="qr-active" checked={active} onCheckedChange={setActive} aria-label="Resposta ativa" />
                <Label htmlFor="qr-active">Ativa (aparece na conversa)</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prévia</Label>
              <Select value={previewLead} onValueChange={setPreviewLead}>
                <SelectTrigger aria-label="Lead da prévia"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SAMPLE_LEAD.id}>Exemplo: {SAMPLE_LEAD.name}</SelectItem>
                  {leads.slice(0, 50).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div data-testid="quick-reply-preview" className="min-h-[140px] whitespace-pre-line rounded-lg border bg-muted/40 p-3 text-sm">
                {preview || <span className="text-muted-foreground">Escreva o texto para ver a prévia.</span>}
              </div>
              <p className="text-xs text-muted-foreground">Sem valor (ex.: sem endereço), a linha do texto some sozinha.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir resposta rápida?</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget && <>Excluir <strong>{deleteTarget.title}</strong>? Esta ação não pode ser desfeita.</>}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) remove.mutate(deleteTarget.id, { onSuccess: () => toast.success("Resposta excluída.") }); setDeleteTarget(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
