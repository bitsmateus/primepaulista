import { sql } from "drizzle-orm";
import { db } from "../db/index";
import { automations, messageLogs } from "../db/schema/index";
import { isWhatsappConfigured, loadWhatsappConfig, sendWhatsappMessage } from "./whatsapp";

const DEFAULT_AUTOMATIONS = [
  {
    key: "pos_venda",
    enabled: false,
    daysAfter: 3,
    message:
      "Olá {nome}! Tudo certo com seu aparelho? 🍎 Qualquer dúvida, a Prime Paulista está à disposição!",
  },
  {
    key: "reativacao",
    enabled: false,
    daysAfter: 90,
    message:
      "Olá {nome}! Faz um tempo que você não aparece. Temos novidades na Prime Paulista, vem conferir! 🎉",
  },
];

export async function getAutomations() {
  let rows = await db.select().from(automations);
  if (rows.length === 0) {
    await db.insert(automations).values(DEFAULT_AUTOMATIONS);
    rows = await db.select().from(automations);
  }
  return rows;
}

const firstName = (name: string) => name.split(" ")[0];

interface RunSummary {
  whatsappConfigured: boolean;
  posVenda: { attempted: number; sent: number };
  reativacao: { attempted: number; sent: number };
}

// Executa as automações habilitadas. Idempotente: usa message_logs como marcador
// para não enviar a mesma automação duas vezes ao mesmo destinatário.
export async function runAutomations(): Promise<RunSummary> {
  const cfg = await loadWhatsappConfig();
  const list = await getAutomations();
  const summary: RunSummary = {
    whatsappConfigured: isWhatsappConfigured(cfg),
    posVenda: { attempted: 0, sent: 0 },
    reativacao: { attempted: 0, sent: 0 },
  };

  // ---- Pós-venda: vendas feitas há exatamente N dias ----
  const pos = list.find((a) => a.key === "pos_venda");
  if (pos?.enabled) {
    const res = await db.execute(sql`
      select s.id as sale_id, c.id as customer_id, c.name, c.whatsapp
      from sales s
      join customers c on c.id = s.customer_id
      where date(s.created_at) = current_date - (${pos.daysAfter} * interval '1 day')
        and coalesce(c.whatsapp, '') <> ''
        and not exists (
          select 1 from message_logs m
          where m.recipient_id = c.id and m.template_type = 'auto_pos_venda'
        )
    `);
    for (const r of res.rows as Array<{ customer_id: string; name: string; whatsapp: string }>) {
      summary.posVenda.attempted++;
      const msg = pos.message.replace(/{nome}/g, firstName(r.name));
      const ok = await sendWhatsappMessage(r.whatsapp, msg);
      await db.insert(messageLogs).values({
        recipientId: r.customer_id,
        recipientName: r.name,
        recipientPhone: r.whatsapp,
        templateType: "auto_pos_venda",
        message: msg,
        status: ok ? "sent" : "failed",
      });
      if (ok) summary.posVenda.sent++;
    }
  }

  // ---- Reativação: clientes cuja última compra foi há mais de N dias ----
  const re = list.find((a) => a.key === "reativacao");
  if (re?.enabled) {
    const res = await db.execute(sql`
      select c.id as customer_id, c.name, c.whatsapp
      from customers c
      join sales s on s.customer_id = c.id
      where coalesce(c.whatsapp, '') <> ''
        and not exists (
          select 1 from message_logs m
          where m.recipient_id = c.id and m.template_type = 'auto_reativacao'
            and m.sent_at > now() - (${re.daysAfter} * interval '1 day')
        )
      group by c.id, c.name, c.whatsapp
      having max(s.created_at) < now() - (${re.daysAfter} * interval '1 day')
    `);
    for (const r of res.rows as Array<{ customer_id: string; name: string; whatsapp: string }>) {
      summary.reativacao.attempted++;
      const msg = re.message.replace(/{nome}/g, firstName(r.name));
      const ok = await sendWhatsappMessage(r.whatsapp, msg);
      await db.insert(messageLogs).values({
        recipientId: r.customer_id,
        recipientName: r.name,
        recipientPhone: r.whatsapp,
        templateType: "auto_reativacao",
        message: msg,
        status: ok ? "sent" : "failed",
      });
      if (ok) summary.reativacao.sent++;
    }
  }

  return summary;
}
