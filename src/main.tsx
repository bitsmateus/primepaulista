import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// Service worker (PWA): busca uma versão nova a cada abertura e, com a aba aberta,
// a cada 30 min — e aplica sozinho (registerType "autoUpdate"). Assim, um F5 do
// cliente já basta depois de um deploy; não precisa mais pedir para limpar o cache.
const UPDATE_CHECK_MS = 30 * 60 * 1000;
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    setInterval(async () => {
      if (registration.installing || !navigator.onLine) return;
      try {
        const resp = await fetch(swUrl, { cache: "no-store", headers: { "cache-control": "no-cache" } });
        if (resp.status === 200) await registration.update();
      } catch {
        // offline ou falha na checagem: tenta de novo no próximo intervalo
      }
    }, UPDATE_CHECK_MS);
  },
});

createRoot(document.getElementById("root")!).render(<App />);
