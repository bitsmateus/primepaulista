import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { whatsappConfig, whatsappInstances } from "../db/schema/index";

// === Instâncias (multinúmero) ===

// Retorna todas as instâncias. Na primeira vez, migra a config singleton (legado).
export async function getInstances() {
  let rows = await db.select().from(whatsappInstances);
  if (rows.length === 0) {
    const [legacy] = await db.select().from(whatsappConfig).limit(1);
    if (legacy && legacy.instanceUrl && legacy.apiKey) {
      await db.insert(whatsappInstances).values({
        name: legacy.instanceName || "Principal",
        apiKey: legacy.apiKey,
        instanceUrl: legacy.instanceUrl,
        instanceName: legacy.instanceName,
      });
      rows = await db.select().from(whatsappInstances);
    }
  }
  return rows;
}

export async function getInstance(id: string) {
  const [row] = await db.select().from(whatsappInstances).where(eq(whatsappInstances.id, id)).limit(1);
  return row ?? null;
}

// Instância ativa padrão (usada pela automação/cron quando não há instância específica).
export async function getDefaultInstance() {
  const rows = await getInstances();
  return rows.find((r) => r.active && r.instanceUrl && r.apiKey) ?? null;
}

export function isInstanceConfigured(inst: { instanceUrl: string; apiKey: string } | null) {
  return Boolean(inst && inst.instanceUrl && inst.apiKey);
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

// Envia mensagem de texto por uma instância (ou pela padrão). Retorna true/false.
export async function sendWhatsappMessage(
  phone: string,
  message: string,
  instanceId?: string
): Promise<boolean> {
  const inst = instanceId ? await getInstance(instanceId) : await getDefaultInstance();
  if (!isInstanceConfigured(inst)) return false;
  try {
    const r = await callUazapi(inst!, "/message/text", "POST", {
      number: phone.replace(/\D/g, ""),
      text: message,
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Envia mídia (imagem) com legenda por uma instância. Retorna true/false.
// NOTE: confirmar o path/payload exato de mídia da Uazapi (/send/media) antes de usar em produção.
export async function sendWhatsappMedia(
  phone: string,
  imageUrl: string,
  caption: string,
  instanceId?: string
): Promise<boolean> {
  const inst = instanceId ? await getInstance(instanceId) : await getDefaultInstance();
  if (!isInstanceConfigured(inst)) return false;
  try {
    const r = await callUazapi(inst!, "/send/media", "POST", {
      number: phone.replace(/\D/g, ""),
      type: "image",
      file: imageUrl,
      text: caption,
    });
    return r.ok;
  } catch {
    return false;
  }
}

// === Compat: automação ainda chama estes nomes ===
export async function loadWhatsappConfig() {
  return getDefaultInstance();
}
export function isWhatsappConfigured(cfg: { instanceUrl: string; apiKey: string } | null) {
  return isInstanceConfigured(cfg);
}
