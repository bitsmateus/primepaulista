import { db } from "../db/index";
import { whatsappConfig } from "../db/schema/index";

export async function loadWhatsappConfig() {
  const [row] = await db.select().from(whatsappConfig).limit(1);
  return row ?? null;
}

export function isWhatsappConfigured(cfg: { instanceUrl: string; apiKey: string } | null) {
  return Boolean(cfg && cfg.instanceUrl && cfg.apiKey);
}

// Envia uma mensagem de texto via Uazapi. Retorna true/false (não lança).
export async function sendWhatsappMessage(phone: string, message: string): Promise<boolean> {
  const cfg = await loadWhatsappConfig();
  if (!isWhatsappConfigured(cfg)) return false;
  const cleanPhone = phone.replace(/\D/g, "");
  try {
    const res = await fetch(`${cfg!.instanceUrl.replace(/\/$/, "")}/message/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg!.apiKey },
      body: JSON.stringify({ number: cleanPhone, text: message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
