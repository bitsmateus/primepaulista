// Limpa os caches do PWA (service worker + Cache Storage) e recarrega a página,
// forçando o navegador a baixar a versão mais nova do sistema.
export async function clearAppCache(): Promise<void> {
  try {
    // Remove todos os caches do Cache Storage (Workbox precache, runtime, etc.)
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    // Desregistra os service workers para o próximo carregamento vir limpo
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } finally {
    // Recarrega ignorando o cache HTTP
    window.location.reload();
  }
}
