import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, Supplier, SupplierInput } from "@/lib/api";

// Lista de fornecedores (base dos seletores e da tela Fornecedores)
export function useSuppliers(params: { q?: string; active?: boolean } = {}, enabled = true) {
  return useQuery<Supplier[]>({
    queryKey: ["suppliers", params.q ?? "", params.active ?? "all"],
    queryFn: () => api.listSuppliers(params),
    enabled,
    staleTime: 15_000,
  });
}

export function useSupplierMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["suppliers"] });
  const fail = (fallback: string) => (err: unknown) => toast.error(err instanceof ApiError ? err.message : fallback);
  const create = useMutation({
    mutationFn: (input: SupplierInput) => api.createSupplier(input),
    onSuccess: refresh,
    onError: fail("Não foi possível cadastrar o fornecedor."),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SupplierInput> }) => api.updateSupplier(id, patch),
    onSuccess: () => {
      refresh();
      qc.invalidateQueries({ queryKey: ["supplier"] });
      qc.invalidateQueries({ queryKey: ["devices"] }); // nome exibido nos aparelhos pode mudar
    },
    onError: fail("Não foi possível salvar o fornecedor."),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteSupplier(id),
    onSuccess: refresh,
  });
  return { create, update, remove };
}
