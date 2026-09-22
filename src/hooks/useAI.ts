import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, type AiDocumentInput, type AiSettingsView } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";

const fail = (fallback: string) => (err: unknown) => toast.error(err instanceof ApiError ? err.message : fallback);

// Estado da IA (chave cadastrada? ligada? envio automático?) + itens na fila de revisão
export function useAiStatus() {
  const { user } = useAuth();
  const on = can(user?.role, "useAI") || can(user?.role, "manageAI");
  return useQuery({ queryKey: ["aiStatus"], queryFn: api.aiStatus, enabled: on, refetchInterval: 30_000, retry: false });
}

export function useAiConfig() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["aiConfig"], queryFn: api.aiConfig, enabled: can(user?.role, "manageAI"), retry: false });
  const save = useMutation({
    mutationFn: (c: AiSettingsView) => api.saveAiConfig(c),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aiConfig"] });
      qc.invalidateQueries({ queryKey: ["aiStatus"] });
    },
    onError: fail("Não foi possível salvar a configuração da IA."),
  });
  return { ...q, save };
}

export function useAiDocuments() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["aiDocuments"] });
  const q = useQuery({ queryKey: ["aiDocuments"], queryFn: api.listAiDocuments, enabled: can(user?.role, "manageAI") });
  const create = useMutation({ mutationFn: (v: AiDocumentInput) => api.createAiDocument(v), onSuccess: invalidate, onError: fail("Não foi possível salvar o documento.") });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AiDocumentInput> }) => api.updateAiDocument(id, patch),
    onSuccess: invalidate,
    onError: fail("Não foi possível salvar o documento."),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteAiDocument(id), onSuccess: invalidate, onError: fail("Não foi possível excluir o documento.") });
  return { documents: q.data ?? [], isLoading: q.isLoading, create, update, remove };
}

export function useAiReviews(status: "pendente" | "resolvidas" | "todas") {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["aiReviews"] });
    qc.invalidateQueries({ queryKey: ["aiStatus"] });
    qc.invalidateQueries({ queryKey: ["notificationsSummary"] });
  };
  const q = useQuery({
    queryKey: ["aiReviews", status],
    queryFn: () => api.listAiReviews(status),
    enabled: can(user?.role, "useAI"),
    refetchInterval: 30_000,
  });
  const approve = useMutation({
    mutationFn: ({ id, text }: { id: string; text?: string }) => api.approveAiReview(id, text),
    onSuccess: invalidate,
    onError: invalidate, // falha de envio também atualiza a tela (o item volta "pendente" com o motivo)
  });
  const discard = useMutation({ mutationFn: (id: string) => api.discardAiReview(id), onSuccess: invalidate, onError: fail("Não foi possível descartar.") });
  return { reviews: q.data?.reviews ?? [], pending: q.data?.pending ?? 0, isLoading: q.isLoading, approve, discard };
}

export function useAiMetrics(days: number) {
  const { user } = useAuth();
  return useQuery({ queryKey: ["aiMetrics", days], queryFn: () => api.aiMetrics(days), enabled: can(user?.role, "manageAI"), refetchInterval: 60_000 });
}
