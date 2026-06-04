import { db } from "../db/index";
import { whatsappConfig } from "../db/schema/index";

export async function loadWhatsappConfig() {
  const [row] = await db.select().from(whatsappConfig).limit(1);
  return row ?? null;
}

export function isWhatsappConfigured(cfg: { instanceUrl: string; apiKey: string } | null) {
  return Boolean(cfg && cfg.instanceUrl && cfg.apiKey);
}

// Chamada genérica à API da Uazapi (usada pelas rotas e pelas automações)
export async function callUazapi(
  cfg: { apiKey: string; instanceUrl: string },
  path: string,
  method: "GET" | "POST",
  body?: unknown
) {
  const res = await fetch(`${cfg.instanceUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Envia uma mensagem de texto via Uazapi. Retorna true/false (não lança).
export async function sendWhatsappMessage(phone: string, message: string): Promise<boolean> {
  const cfg = await loadWhatsappConfig();
  if (!isWhatsappConfigured(cfg)) return false;
  try {
    const r = await callUazapi(cfg!, "/message/text", "POST", {
      number: phone.replace(/\D/g, ""),
      text: message,
    });
    return r.ok;
  } catch {
    return false;
  }
}
