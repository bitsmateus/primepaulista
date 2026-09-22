import { useEffect, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  DEFAULT_STORE, getLogoSrc, getStoreSettings, setLogoOverride, setStoreSettings, subscribeStoreSettings,
  type StoreSettings,
} from "@/lib/storeSettings";
import { DEFAULT_WARRANTY_TERMS, setWarrantyTerms, type WarrantyTerms } from "@/lib/warrantyTerms";

export interface SecuritySettings {
  autoLockMinutes: number; // 0 = desligado
}
export const DEFAULT_SECURITY: SecuritySettings = { autoLockMinutes: 0 };

export type SettingKeyName = "store" | "logo" | "warranty_terms" | "security";

export function useSetting<T>(key: SettingKeyName, enabled = true) {
  return useQuery<T>({
    queryKey: ["settings", key],
    queryFn: () => api.getSetting<T>(key),
    staleTime: 60_000,
    enabled,
  });
}

// Grava uma configuração e atualiza o cache do React Query (o Bootstrap repassa aos caches síncronos)
export function useSaveSetting<T>(key: SettingKeyName, okMessage = "Configuração salva.") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: T) => api.saveSetting<T>(key, v),
    onSuccess: (v) => {
      qc.setQueryData(["settings", key], v);
      // mantém o pacote (usado pelo bloqueio de tela etc.) em dia
      qc.setQueryData(["settingsBundle"], (old: Record<string, unknown> | undefined) => (old ? { ...old, [key]: v } : old));
      toast.success(okMessage);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar."),
  });
}

// Uma única chamada traz loja, logo, termos de garantia e segurança (poupa o limite de requisições).
// As abas de Configurações e o resto do app leem/atualizam os mesmos dados pelas chaves ["settings", chave].
function useSettingsBundle(enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["settingsBundle"],
    queryFn: async () => {
      const b = await api.getSettingsBundle();
      for (const key of ["store", "logo", "warranty_terms", "security"] as const) {
        qc.setQueryData(["settings", key], b[key]);
      }
      return b;
    },
    staleTime: 60_000,
    enabled,
  });
}

// Carrega loja, logo, termos de garantia e segurança logo após o login e alimenta os caches
// síncronos (getStoreSettings etc.) que os documentos impressos usam. Sem servidor, valem os padrões.
export function SettingsBootstrap() {
  const { user } = useAuth();
  useSettingsBundle(!!user);
  // Depois de salvar uma configuração (cache ["settings", chave]), os caches síncronos acompanham
  const store = useSetting<StoreSettings>("store", false);
  const logo = useSetting<{ dataUrl: string }>("logo", false);
  const terms = useSetting<WarrantyTerms>("warranty_terms", false);

  useEffect(() => {
    if (store.data) setStoreSettings(store.data);
  }, [store.data]);
  useEffect(() => {
    if (logo.data) setLogoOverride(logo.data.dataUrl);
  }, [logo.data]);
  useEffect(() => {
    if (terms.data) setWarrantyTerms(terms.data);
  }, [terms.data]);
  // Ao sair, volta aos padrões (o próximo usuário recarrega os dele)
  useEffect(() => {
    if (!user) {
      setStoreSettings(null);
      setLogoOverride("");
      setWarrantyTerms(null);
    }
  }, [user]);
  return null;
}

// Leitura reativa dos caches síncronos (menu, login, etc.)
export function useStoreSnapshot(): StoreSettings {
  return useSyncExternalStore(subscribeStoreSettings, getStoreSettings, () => DEFAULT_STORE);
}
export function useLogoSrc(): string {
  return useSyncExternalStore(subscribeStoreSettings, getLogoSrc, getLogoSrc);
}

export function useSecurity() {
  const { user } = useAuth();
  const bundle = useSettingsBundle(!!user); // mesma chamada do Bootstrap (não faz requisição extra)
  return bundle.data?.security ?? DEFAULT_SECURITY;
}

export { DEFAULT_WARRANTY_TERMS };
