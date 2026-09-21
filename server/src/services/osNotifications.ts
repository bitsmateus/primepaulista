import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { osNotifications, serviceOrders } from "../db/schema/index";
import { callUazapi, getDefaultInstance } from "./whatsapp";
import { getSetting } from "./settings";
import { renderOsMessage, withStoreFallback, type OsEvent } from "./osMessages";

// Status da OS -> evento de notificação
export const EVENT_BY_STATUS: Record<string, OsEvent | undefined> = {
  "Aguardando Aprovação": "aguardando_aprovacao",
  "Pronto para Retirada": "pronto_retirada",
  "Entregue / Finalizado": "entregue",
};

export interface NotifyResult {
  id: string;
  status: "sent" | "failed" | "pending";
  error: string | null;
  event: OsEvent;
}

// Telefone do Brasil: 10/11 dígitos ganham o 55 na frente (o Uazapi exige DDI)
export function normalizePhone(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

// Notifica o cliente da OS por WhatsApp (Uazapi) e registra no histórico.
// NUNCA lança: falha de notificação não pode quebrar a mudança de status.
//  - "sent"    : provedor aceitou
//  - "failed"  : tentamos enviar e o provedor recusou / deu erro de rede
//  - "pending" : nem tentamos (sem telefone, sem instância, WhatsApp desconectado);
//                o motivo fica em `error` e dá para reenviar depois
// manual=true (botão "Notificar agora") ignora o interruptor do evento.
export async function notifyOs(
  osId: string,
  event: OsEvent,
  opts: { userId?: string | null; manual: boolean }
): Promise<NotifyResult | null> {
  try {
    const [os] = await db.select().from(serviceOrders).where(eq(serviceOrders.id, osId)).limit(1);
    if (!os) return null;
    const settings = withStoreFallback(await getSetting("os_messages"), await getSetting("store"));
    if (!opts.manual && !settings.enabled[event]) return null;

    const phone = normalizePhone(os.customerPhone);
    // OS de aparelho do estoque sem telefone não tem cliente para avisar: não gera ruído
    if (!opts.manual && !phone && os.origin === "Estoque da loja") return null;

    const message = renderOsMessage(
      settings.templates[event],
      {
        id: os.id,
        customerName: os.customerName,
        model: os.model,
        color: os.color,
        serialImei: os.serialImei,
        serial: os.serial,
        chargedAmount: Number(os.chargedAmount),
        costResponsibility: os.costResponsibility,
      },
      settings
    );

    let status: NotifyResult["status"] = "pending";
    let error: string | null = null;

    if (!phone) {
      error = "OS sem telefone do cliente.";
    } else {
      const inst = await getDefaultInstance();
      if (!inst) {
        error = "Nenhuma instância de WhatsApp ativa e configurada.";
      } else {
        let connected = false;
        try {
          const st = await callUazapi(inst, "/instance/status", "GET");
          const state = String(st.data?.state || st.data?.status || "").toLowerCase();
          connected = st.ok && (state === "open" || state === "connected");
        } catch {
          connected = false;
        }
        if (!connected) {
          error = "WhatsApp desconectado (leia o QR Code na aba WhatsApp).";
        } else {
          try {
            const r = await callUazapi(inst, "/message/text", "POST", { number: phone, text: message });
            if (r.ok) {
              status = "sent";
            } else {
              status = "failed";
              error = `O provedor recusou o envio (HTTP ${r.status}).`;
            }
          } catch (err) {
            status = "failed";
            error = `Falha de comunicação com o provedor: ${(err as Error).message}`.slice(0, 300);
          }
        }
      }
    }

    const [row] = await db
      .insert(osNotifications)
      .values({ osId, event, phone, message, status, error, createdBy: opts.userId ?? null })
      .returning();
    return { id: row.id, status, error, event };
  } catch (err) {
    console.error("falha ao notificar OS", osId, (err as Error).message);
    return null;
  }
}
