import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/index";
import { authenticate, currentRole, requireCapability, type JwtUser } from "../plugins/auth";
import { can } from "../lib/permissions";
import { getSetting } from "../services/settings";
import { dayLabel } from "../services/planning";

export interface NotificationCounts {
  osReady: number; // OS "Pronto para Retirada" sem aviso de WhatsApp enviado
  tasksDue: number; // tarefas de lead (do usuário) vencidas ou para hoje
  quotesToday: number; // orçamentos que vencem hoje
  lowStock: number; // acessórios com estoque baixo ou zerado
  staleDevices: number; // aparelhos disponíveis parados há mais de 30 dias
  taskReminders: number; // lembretes de tarefa do planejamento que VENCERAM e foram entregues agora
  newMessages: number; // mensagens de WhatsApp recebidas (webhook) que ninguém abriu ainda (CRM)
  aiReviews: number; // respostas da IA aguardando revisão (Fase 5B)
}

export interface TaskReminder {
  id: string;
  title: string;
  dayLabel: string;
}

const TZ = "America/Sao_Paulo";
const today = sql`(now() AT TIME ZONE ${TZ})::date`;

// Contadores de eventos acionáveis. Cada contador só aparece para quem tem a capacidade correspondente.
export async function notificationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/notifications/summary", { preHandler: requireCapability("viewStock", "viewOS", "sell", "useCRM") }, async (req) => {
    const me = req.user as JwtUser;
    const role = currentRole(req);
    const counts: Partial<NotificationCounts> = {};

    if (can(role, "viewOS")) {
      const os = await getSetting("os_messages");
      if (os.enabled.pronto_retirada) {
        const r = await db.execute(sql`
          select count(*)::int as n from service_orders o
          where o.status = 'Pronto para Retirada'
            and not (o.origin = 'Estoque da loja' and btrim(coalesce(o.customer_phone, '')) = '')
            and not exists (
              select 1 from os_notifications n
              where n.os_id = o.id and n.event = 'pronto_retirada' and n.status = 'sent'
            )`);
        counts.osReady = Number((r.rows[0] as { n: number }).n);
      } else counts.osReady = 0;
    }

    if (can(role, "useCRM")) {
      const r = await db.execute(sql`
        select count(*)::int as n from lead_tasks t
        join leads l on l.id = t.lead_id
        where t.done = false and t.due_date is not null
          and l.owner_id = ${me.sub}
          and (t.due_date AT TIME ZONE ${TZ})::date <= ${today}`);
      counts.tasksDue = Number((r.rows[0] as { n: number }).n);
      const inbox = await db.execute(sql`
        select count(*)::int as n from message_logs where direction = 'in' and read_at is null`);
      counts.newMessages = Number((inbox.rows[0] as { n: number }).n);
    }

    if (can(role, "useAI")) {
      const rv = await db.execute(sql`select count(*)::int as n from ai_reviews where status = 'pendente'`);
      counts.aiReviews = Number((rv.rows[0] as { n: number }).n);
    }

    if (can(role, "sell")) {
      // vendedor vê os próprios; quem edita vendas (gerente/admin) vê todos
      const own = can(role, "editSales") ? sql`true` : sql`q.seller_id = ${me.sub}`;
      const r = await db.execute(sql`
        select count(*)::int as n from quotes q
        where q.status in ('Aberto', 'Enviado', 'Aprovado') and q.valid_until is not null
          and (q.valid_until AT TIME ZONE ${TZ})::date = ${today}
          and ${own}`);
      counts.quotesToday = Number((r.rows[0] as { n: number }).n);
    }

    if (can(role, "viewStock")) {
      const low = await db.execute(sql`select count(*)::int as n from accessories where quantity <= min_quantity`);
      counts.lowStock = Number((low.rows[0] as { n: number }).n);
      const stale = await db.execute(sql`
        select count(*)::int as n from devices
        where status = 'Disponível' and coalesce(entry_date, created_at) < now() - interval '30 days'`);
      counts.staleDevices = Number((stale.rows[0] as { n: number }).n);
    }

    // Lembretes do planejamento: entrega UMA vez (marca reminded_at ao entregar). Vale para qualquer cargo.
    const due = await db.execute(sql`
      update weekly_tasks set reminded_at = now()
      where assignee_id = ${me.sub} and done = false and remind_at is not null
        and remind_at <= now() and reminded_at is null
      returning id, title, week_start::text as week_start, weekday`);
    const reminders: TaskReminder[] = (due.rows as { id: string; title: string; week_start: string; weekday: number }[]).map((r) => ({
      id: r.id,
      title: r.title,
      dayLabel: dayLabel(r.week_start, Number(r.weekday)),
    }));
    counts.taskReminders = reminders.length;

    return { counts, reminders };
  });
}
