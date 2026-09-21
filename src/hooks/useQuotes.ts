import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { QuoteInput, QuoteStatus } from "@/types/quote";

export function useQuotes(enabled = true) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["quotes"] });
  const fail = (fallback: string) => (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : fallback);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotes"],
    queryFn: api.listQuotes,
    enabled,
  });

  const createMut = useMutation({
    mutationFn: (input: QuoteInput) => api.createQuote(input),
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: QuoteInput }) => api.updateQuote(id, input),
    onSuccess: invalidate,
  });
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Exclude<QuoteStatus, "Convertido"> }) =>
      api.setQuoteStatus(id, status),
    onSuccess: invalidate,
    onError: fail("Não foi possível mudar o status do orçamento."),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteQuote(id),
    onSuccess: invalidate,
    onError: fail("Não foi possível excluir o orçamento."),
  });

  return {
    quotes,
    isLoading,
    createQuote: (input: QuoteInput) => createMut.mutateAsync(input),
    updateQuote: (id: string, input: QuoteInput) => updateMut.mutateAsync({ id, input }),
    setStatus: (id: string, status: Exclude<QuoteStatus, "Convertido">) => statusMut.mutateAsync({ id, status }),
    deleteQuote: (id: string) => deleteMut.mutateAsync(id),
  };
}
