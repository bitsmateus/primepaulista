import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "../db/index";
import { profiles, weeklyTasks, type WeeklyTask } from "../db/schema/index";
import { callUazapi, getDefaultInstance } from "./whatsapp";
import { normalizePhone } from "./osNotifications";
import { getSetting } from "./settings";
import { renderReminder } from "../lib/planningRules";

export { DEFAULT_REMINDER_TEMPLATE, addDays, dateOfWeekday, dayLabel, firstName, isMonday, renderReminder, weekStartOf } from "../lib/planningRules";

export type WhatsappStatus = "sent" | "failed" | "no_phone" | "no_instance";
export interface WhatsappResult {
  status: WhatsappStatus;
  error: string | null;
}

// Envia o lembrete por WhatsApp (Uazapi) ao colaborador e grava o resultado na tarefa.
// NUNCA lança: falha de WhatsApp não pode quebrar salvar/mover a tarefa.
export async function sendTaskWhatsapp(task: WeeklyTask): Promise<WhatsappResult | null> {
  try {
    if (!task.assigneeId) return null;
    const [person] = await db.select().from(profiles).where(eq(profiles.id, task.assigneeId)).limit(1);
    const store = await getSetting("store");
    const phone = normalizePhone(person?.phone);
    let result: WhatsappResult;
    if (!phone) {
      result = { status: "no_phone", error: "O colaborador não tem WhatsApp cadastrado (Usuários)." };
    } else {
      const inst = await getDefaultInstance();
      if (!inst) {
        result = { status: "no_instance", error: "Nenhuma instância de WhatsApp ativa e configurada." };
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
          result = { status: "no_instance", error: "WhatsApp desconectado (leia o QR Code na aba WhatsApp)." };
        } else {
          const text = renderReminder(task.reminderMessage, {
            assigneeName: task.assigneeName || person?.name || "",
            title: task.title,
            weekStart: task.weekStart,
            weekday: task.weekday,
            storeName: store.name,
          });
          try {
            const r = await callUazapi(inst, "/message/text", "POST", { number: phone, text });
            result = r.ok
              ? { status: "sent", error: null }
              : { status: "failed", error: `O provedor recusou o envio (HTTP ${r.status}).` };
          } catch (err) {
            result = { status: "failed", error: `Falha de comunicação com o provedor: ${(err as Error).message}`.slice(0, 300) };
          }
        }
      }
    }
    await db
      .update(weeklyTasks)
      .set({ whatsappStatus: result.status, whatsappError: result.error, whatsappAt: new Date() })
      .where(eq(weeklyTasks.id, task.id));
    return result;
  } catch (err) {
    console.error("falha ao enviar lembrete de tarefa", task.id, (err as Error).message);
    return null;
  }
}

// Chamado a cada minuto pelo agendador: envia por WhatsApp os lembretes que já venceram
// e ainda não foram tentados. A "reserva" (whatsapp_at) evita envio duplo se dois ciclos se cruzarem.
export async function dispatchDueWhatsapp(): Promise<number> {
  const due = await db
    .select()
    .from(weeklyTasks)
    .where(
      and(
        lte(weeklyTasks.remindAt, new Date()),
        isNull(weeklyTasks.whatsappStatus),
        isNull(weeklyTasks.whatsappAt),
        eq(weeklyTasks.done, false)
      )
    )
    .limit(50);
  let n = 0;
  for (const t of due) {
    if (!t.assigneeId) continue;
    if (await claimAndSendTaskWhatsapp(t.id)) n++;
  }
  return n;
}

// Reserva a tarefa (whatsapp_at) e envia. Devolve null se outro ciclo já pegou.
export async function claimAndSendTaskWhatsapp(taskId: string): Promise<WhatsappResult | null> {
  const [claimed] = await db
    .update(weeklyTasks)
    .set({ whatsappAt: new Date() })
    .where(and(eq(weeklyTasks.id, taskId), isNull(weeklyTasks.whatsappAt)))
    .returning();
  if (!claimed) return null;
  return sendTaskWhatsapp(claimed);
}
