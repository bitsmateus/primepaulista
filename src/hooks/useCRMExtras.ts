import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, type KeywordRuleInput, type QuickReplyInput } from "@/lib/api";
import { DEFAULT_BUSINESS_HOURS, type BusinessHours } from "@/lib/keywordRules";
import { DEFAULT_AGENDA_CONFIG, type AgendaConfig } from "@/lib/agenda";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";

const fail = (fallback: string) => (err: unknown) =>
  toast.error(err instanceof ApiError ? err.message : fallback);

// Respostas rápidas (Fase 5A): todos com CRM leem; quem tem manageAutomations edita
export function useQuickReplies(enabled = true) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const on = enabled && can(user?.role, "useCRM");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["quickReplies"] });
  const { data: quickReplies = [], isLoading } = useQuery({ queryKey: ["quickReplies"], queryFn: api.listQuickReplies, enabled: on });
  const create = useMutation({
    mutationFn: (v: QuickReplyInput) => api.createQuickReply(v),
    onSuccess: invalidate,
    onError: fail("Não foi possível salvar a resposta."),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<QuickReplyInput> }) => api.updateQuickReply(id, patch),
    onSuccess: invalidate,
    onError: fail("Não foi possível salvar a resposta."),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteQuickReply(id),
    onSuccess: invalidate,
    onError: fail("Não foi possível excluir a resposta."),
  });
  return { quickReplies, isLoading, create, update, remove, canManage: can(user?.role, "manageAutomations") };
}

// Respostas automáticas por palavra-chave (Fase 5A)
export function useKeywordRules() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["keywordRules"] });
    qc.invalidateQueries({ queryKey: ["keywordStats"] });
    qc.invalidateQueries({ queryKey: ["keywordHits"] });
  };
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["keywordRules"],
    queryFn: api.listKeywordRules,
    enabled: can(user?.role, "useCRM"),
  });
  const create = useMutation({
    mutationFn: (v: KeywordRuleInput) => api.createKeywordRule(v),
    onSuccess: invalidate,
    onError: fail("Não foi possível salvar a regra."),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<KeywordRuleInput> }) => api.updateKeywordRule(id, patch),
    onSuccess: invalidate,
    onError: fail("Não foi possível salvar a regra."),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteKeywordRule(id),
    onSuccess: invalidate,
    onError: fail("Não foi possível excluir a regra."),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.reorderKeywordRules(ids),
    onSuccess: invalidate,
    onError: fail("Não foi possível reordenar."),
  });
  return { rules, isLoading, create, update, remove, reorder, canManage: can(user?.role, "manageAutomations") };
}

export function useKeywordStats(days = 30) {
  return useQuery({ queryKey: ["keywordStats", days], queryFn: () => api.keywordRuleStats(days), refetchInterval: 30_000 });
}

export function useKeywordHits(limit = 30) {
  return useQuery({ queryKey: ["keywordHits", limit], queryFn: () => api.keywordRuleHits(limit), refetchInterval: 30_000 });
}

// Horário comercial (respostas automáticas): todos leem; admin/gerente gravam
export function useBusinessHours() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["settings", "business_hours"],
    queryFn: () => api.getSetting<BusinessHours>("business_hours"),
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: (v: BusinessHours) => api.saveSetting<BusinessHours>("business_hours", v),
    onSuccess: (v) => {
      qc.setQueryData(["settings", "business_hours"], v);
      toast.success("Horário comercial salvo.");
    },
    onError: fail("Não foi possível salvar o horário comercial."),
  });
  return { hours: data ?? DEFAULT_BUSINESS_HOURS, isLoading, save };
}

// Configuração da Agenda (dias de cada sugestão)
export function useAgendaConfig() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["settings", "crm_agenda"],
    queryFn: () => api.getSetting<AgendaConfig>("crm_agenda"),
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: (v: AgendaConfig) => api.saveSetting<AgendaConfig>("crm_agenda", v),
    onSuccess: (v) => {
      qc.setQueryData(["settings", "crm_agenda"], v);
      toast.success("Configuração da agenda salva.");
    },
    onError: fail("Não foi possível salvar a configuração."),
  });
  return { config: data ?? DEFAULT_AGENDA_CONFIG, isLoading, save };
}
