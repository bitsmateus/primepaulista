import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Pencil, Send, X } from "lucide-react";
import { ApiError, type AiReviewRow } from "@/lib/api";
import { useAiReviews, useAiStatus } from "@/hooks/useAI";
import { AI_KIND_LABELS, REVIEW_STATUS_LABELS } from "@/lib/aiLabels";
import { ConfidenceBar } from "@/components/ai/AiBits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const dm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";

function ReviewCard({ r, threshold, busy, onApprove, onDiscard }: {
  r: AiReviewRow; threshold: number; busy: boolean;
  onApprove: (text?: string) => Promise<void>; onDiscard: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.suggestedReply);
  const pending = r.status === "pendente";
  return (
    <Card className="border shadow-none" data-testid="review-card" data-status={r.status} data-phone={r.phone}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{r.leadName || r.phone}</span>
          <span className="text-xs text-muted-foreground">{r.phone}</span>
          <Badge variant="outline" className="text-xs">{AI_KIND_LABELS[r.kind] ?? r.kind}</Badge>
          <Badge variant={pending ? "secondary" : r.status === "descartado" ? "outline" : "default"} className="text-xs" data-testid="review-status">{REVIEW_STATUS_LABELS[r.status] ?? r.status}</Badge>
          <span className="ml-auto text-xs text-muted-foreground">{dm(r.createdAt)}</span>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Pergunta do cliente</p>
          <p className="whitespace-pre-line rounded-md border bg-background p-2 text-sm" data-testid="review-question">{r.question}</p>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">{pending ? "Sugestão da IA" : r.status === "editado" ? "Resposta enviada (editada)" : "Resposta"}</p>
            <ConfidenceBar value={r.confidence} threshold={threshold} />
          </div>
          {editing && pending ? (
            <Textarea aria-label="Editar resposta da IA" rows={4} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} />
          ) : (
            <p className="whitespace-pre-line rounded-md border bg-muted/40 p-2 text-sm" data-testid="review-reply">{r.finalReply ?? r.suggestedReply}</p>
          )}
        </div>
        {r.reason && (
          <p className="flex items-start gap-1 text-xs text-warning-foreground" data-testid="review-reason">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /> Por que veio para revisão: {r.reason}
          </p>
        )}
        {r.sources.length > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="review-sources">Fontes: {r.sources.map((s) => s.title).join(" · ")}</p>
        )}
        {r.sendError && pending && <p className="text-xs text-destructive" data-testid="review-send-error">Última tentativa de envio falhou: {r.sendError}</p>}
        {pending ? (
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button size="sm" className="gap-1" disabled={busy || !text.trim()} onClick={() => onApprove(text.trim())}><Send className="h-4 w-4" /> Enviar edição</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(r.suggestedReply); }}>Cancelar edição</Button>
              </>
            ) : (
              <>
                <Button size="sm" className="gap-1" disabled={busy} onClick={() => onApprove()}><Check className="h-4 w-4" /> Aprovar e enviar</Button>
                <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Editar e enviar</Button>
              </>
            )}
            <Button size="sm" variant="outline" className="ml-auto gap-1 text-destructive" disabled={busy} onClick={onDiscard}><X className="h-4 w-4" /> Descartar</Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {r.status === "descartado" ? "Descartada" : "Enviada"} por {r.reviewedByName ?? "—"} em {dm(r.reviewedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Fila de revisão da IA: respostas que precisam de um humano antes de sair (e o histórico)
export default function AiReviewsTab() {
  const [filter, setFilter] = useState<"pendente" | "resolvidas" | "todas">("pendente");
  const { reviews, pending, isLoading, approve, discard } = useAiReviews(filter);
  const { data: st } = useAiStatus();
  const [busyId, setBusyId] = useState<string | null>(null);
  const threshold = st?.confidenceThreshold ?? 0.75;

  const doApprove = async (r: AiReviewRow, text?: string) => {
    setBusyId(r.id);
    try {
      const res = await approve.mutateAsync({ id: r.id, text });
      toast.success(res.status === "editado" ? "Resposta editada e enviada." : "Resposta aprovada e enviada.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível enviar.");
    } finally {
      setBusyId(null);
    }
  };
  const doDiscard = async (r: AiReviewRow) => {
    setBusyId(r.id);
    try {
      await discard.mutateAsync(r.id);
      toast.success("Resposta descartada.");
    } catch {
      /* onError do hook avisa */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="ai-reviews">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-48" aria-label="Filtro da revisão"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="resolvidas">Histórico (tratadas)</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant={pending > 0 ? "default" : "outline"} data-testid="review-pending-count">{pending} pendente(s)</Badge>
        <p className="text-xs text-muted-foreground">A IA nunca envia sozinha o que está aqui: confira, edite se precisar e aprove.</p>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && reviews.length === 0 && (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground" data-testid="review-empty">
          {filter === "pendente" ? "Nenhuma resposta da IA aguardando revisão." : "Nada por aqui ainda."}
        </p>
      )}
      <div className="space-y-3">
        {reviews.map((r) => (
          <ReviewCard key={r.id} r={r} threshold={threshold} busy={busyId === r.id} onApprove={(t) => doApprove(r, t)} onDiscard={() => doDiscard(r)} />
        ))}
      </div>
    </div>
  );
}
