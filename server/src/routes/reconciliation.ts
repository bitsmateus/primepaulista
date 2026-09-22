import type { FastifyInstance } from "fastify";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { paymentMethodEnum } from "../db/schema/index";
import { authenticate, requireCapability, type JwtUser } from "../plugins/auth";
import { brl, logAudit } from "../services/audit";

// Conferência financeira (conciliação de pagamentos). Só quem tem a capacidade `reconcile`
// (admin, gerente, financeiro). Vendas devolvidas ficam de fora (não aparecem e não mudam).

export const AUDIT_STATUSES = ["Aguardando", "Conferido", "Divergente"] as const;
type AuditStatus = (typeof AUDIT_STATUSES)[number];

const TZ = "America/Sao_Paulo";
const MAX_BULK = 5000;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)");

const filterSchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  method: z.enum(paymentMethodEnum.enumValues).optional(),
  status: z.enum(AUDIT_STATUSES).optional(),
  seller: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).optional(),
});
type Filter = z.infer<typeof filterSchema>;

// Cláusulas WHERE (sempre sem devolvidas). `ignoreStatus` serve para os cartões de resumo.
function whereOf(f: Filter, ignoreStatus = false): SQL {
  const c: SQL[] = [sql`s.returned_at is null`];
  if (f.from) c.push(sql`(s.created_at AT TIME ZONE ${TZ})::date >= ${f.from}::date`);
  if (f.to) c.push(sql`(s.created_at AT TIME ZONE ${TZ})::date <= ${f.to}::date`);
  if (f.method) c.push(sql`p.method = ${f.method}`);
  if (f.status && !ignoreStatus) c.push(sql`p.audit_status = ${f.status}`);
  if (f.seller) c.push(sql`coalesce(s.seller_name, '') = ${f.seller}`);
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    c.push(sql`(c.name ilike ${like} or s.seller_name ilike ${like} or p.audit_note ilike ${like}
      or upper(left(s.id::text, 8)) = upper(${f.q}))`);
  }
  return sql.join(c, sql` and `);
}

const FROM = sql`from payments p join sales s on s.id = p.sale_id left join customers c on c.id = s.customer_id`;

interface Row {
  id: string;
  sale_id: string;
  created_at: string;
  customer_name: string | null;
  seller_name: string | null;
  method: string;
  installments: number | null;
  amount: string;
  audit_status: AuditStatus;
  audit_note: string;
  audited_by_name: string;
  audited_at: string | null;
}

const mapRow = (r: Row) => ({
  id: r.id,
  saleId: r.sale_id,
  saleCode: r.sale_id.slice(0, 8).toUpperCase(),
  createdAt: new Date(r.created_at).toISOString(),
  customerName: r.customer_name ?? "Cliente",
  sellerName: r.seller_name ?? "",
  method: r.method,
  installments: r.installments ?? 1,
  amount: Number(r.amount),
  auditStatus: r.audit_status,
  auditNote: r.audit_note,
  auditedByName: r.audited_by_name,
  auditedAt: r.audited_at ? new Date(r.audited_at).toISOString() : null,
});

async function summaryOf(f: Filter) {
  const r = await db.execute(sql`
    select p.audit_status as status, count(*)::int as n, coalesce(sum(p.amount), 0)::text as total
    ${FROM} where ${whereOf(f, true)} group by p.audit_status`);
  const out: Record<AuditStatus, { count: number; total: number }> = {
    Aguardando: { count: 0, total: 0 }, Conferido: { count: 0, total: 0 }, Divergente: { count: 0, total: 0 },
  };
  for (const row of r.rows as { status: AuditStatus; n: number; total: string }[]) {
    if (row.status in out) out[row.status] = { count: Number(row.n), total: Number(row.total) };
  }
  return out;
}

const STATUS_VERB: Record<AuditStatus, { one: string; bulk: string }> = {
  Conferido: { one: "Conferiu o pagamento", bulk: "Conferência realizada em lote pelo responsável financeiro" },
  Divergente: { one: "Marcou como divergente o pagamento", bulk: "Divergências marcadas em lote pelo responsável financeiro" },
  Aguardando: { one: "Desfez a conferência do pagamento", bulk: "Conferência desfeita em lote pelo responsável financeiro" },
};

export async function reconciliationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireCapability("reconcile"));

  // GET /reconciliation — lista paginada + resumo por status (do filtro, exceto o próprio status)
  app.get("/reconciliation", async (req, reply) => {
    const parsed = filterSchema
      .extend({
        limit: z.coerce.number().int().min(1).max(500).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Filtro inválido", details: parsed.error.flatten().fieldErrors });
    const { limit, offset, ...f } = parsed.data;

    const [rows, cnt, summary, sellers] = await Promise.all([
      db.execute(sql`
        select p.id, p.sale_id, s.created_at, c.name as customer_name, s.seller_name, p.method, p.installments,
               p.amount::text as amount, p.audit_status, p.audit_note, p.audited_by_name, p.audited_at
        ${FROM} where ${whereOf(f)}
        order by s.created_at desc, p.id limit ${limit} offset ${offset}`),
      db.execute(sql`select count(*)::int as n, coalesce(sum(p.amount), 0)::text as total ${FROM} where ${whereOf(f)}`),
      summaryOf(f),
      db.execute(sql`select distinct s.seller_name as name from sales s where s.returned_at is null and coalesce(s.seller_name, '') <> '' order by 1`),
    ]);
    const c = cnt.rows[0] as { n: number; total: string };
    return {
      payments: (rows.rows as unknown as Row[]).map(mapRow),
      total: Number(c.n),
      totalAmount: Number(c.total),
      summary,
      sellers: (sellers.rows as { name: string }[]).map((r) => r.name),
    };
  });

  // GET /reconciliation/summary — só os cartões (aba Caixa: "Aguardando conferência (N)")
  app.get("/reconciliation/summary", async (req, reply) => {
    const parsed = filterSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Filtro inválido" });
    return { summary: await summaryOf(parsed.data) };
  });

  // GET /reconciliation/export — todas as linhas do filtro (até 20 mil) para CSV/Excel/relatório
  app.get("/reconciliation/export", async (req, reply) => {
    const parsed = filterSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Filtro inválido" });
    const rows = await db.execute(sql`
      select p.id, p.sale_id, s.created_at, c.name as customer_name, s.seller_name, p.method, p.installments,
             p.amount::text as amount, p.audit_status, p.audit_note, p.audited_by_name, p.audited_at
      ${FROM} where ${whereOf(parsed.data)}
      order by s.created_at desc, p.id limit 20000`);
    return { payments: (rows.rows as unknown as Row[]).map(mapRow) };
  });

  // PATCH /reconciliation/:id — muda o status e/ou a observação (NSU, autenticação, comprovante) de UM pagamento
  app.patch("/reconciliation/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const p = z
      .object({ status: z.enum(AUDIT_STATUSES).optional(), note: z.string().trim().max(500).optional() })
      .refine((v) => v.status !== undefined || v.note !== undefined, "Nada para alterar")
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const me = req.user as JwtUser;

    const found = await db.execute(sql`
      select p.id, p.amount::text as amount, p.method, p.audit_status, p.audit_note, s.returned_at, c.name as customer_name
      ${FROM} where p.id = ${id}`);
    const cur = found.rows[0] as
      | { amount: string; method: string; audit_status: AuditStatus; audit_note: string; returned_at: string | null; customer_name: string | null }
      | undefined;
    if (!cur) return reply.code(404).send({ error: "Pagamento não encontrado" });
    if (cur.returned_at) return reply.code(409).send({ error: "Venda devolvida: o pagamento não entra na conferência." });

    const sets: SQL[] = [];
    const statusChanged = p.data.status !== undefined && p.data.status !== cur.audit_status;
    if (p.data.status !== undefined) {
      if (p.data.status === "Aguardando") {
        sets.push(sql`audit_status = 'Aguardando'`, sql`audited_by = null`, sql`audited_by_name = ''`, sql`audited_at = null`);
      } else {
        sets.push(sql`audit_status = ${p.data.status}`, sql`audited_by = ${me.sub}`, sql`audited_by_name = ${me.name}`, sql`audited_at = now()`);
      }
    }
    const noteChanged = p.data.note !== undefined && p.data.note !== cur.audit_note;
    if (p.data.note !== undefined) sets.push(sql`audit_note = ${p.data.note}`);
    if (sets.length === 0 || (!statusChanged && !noteChanged)) return { ok: true, changed: false };

    await db.execute(sql`update payments set ${sql.join(sets, sql`, `)} where id = ${id}`);

    const what = `${brl(cur.amount)} (${cur.method}) da venda de ${cur.customer_name ?? "cliente"}`;
    if (statusChanged) {
      await logAudit(req, {
        action: "payment.reconcile",
        entity: "payment",
        entityId: id,
        description: `${STATUS_VERB[p.data.status!].one} de ${what}`,
        details: { de: cur.audit_status, para: p.data.status, observacao: p.data.note ?? cur.audit_note },
      });
    }
    if (noteChanged) {
      await logAudit(req, {
        action: "payment.reconcile_note",
        entity: "payment",
        entityId: id,
        description: `Alterou a observação de conferência do pagamento de ${what}`,
        details: { de: cur.audit_note, para: p.data.note },
      });
    }
    return { ok: true, changed: true };
  });

  // POST /reconciliation/bulk — muda o status de vários pagamentos: por ids OU por todo o filtro
  app.post("/reconciliation/bulk", async (req, reply) => {
    const p = z
      .object({
        status: z.enum(AUDIT_STATUSES),
        ids: z.array(z.string().uuid()).min(1).max(MAX_BULK).optional(),
        filter: filterSchema.optional(),
        note: z.string().trim().max(500).optional(),
      })
      .refine((v) => (v.ids ? 1 : 0) + (v.filter ? 1 : 0) === 1, "Informe ids OU filter")
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos", details: p.error.flatten() });
    const me = req.user as JwtUser;
    const { status, ids, filter, note } = p.data;

    const scope = ids
      ? sql`p.id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) and s.returned_at is null`
      : whereOf(filter!);

    // conta antes (o filtro pode pegar mais do que o limite)
    const pre = await db.execute(sql`select count(*)::int as n ${FROM} where ${scope}`);
    const matched = Number((pre.rows[0] as { n: number }).n);
    if (matched > MAX_BULK) {
      return reply.code(400).send({ error: `O filtro pega ${matched} pagamentos; o limite por lote é ${MAX_BULK}. Reduza o período.` });
    }

    const sets: SQL[] =
      status === "Aguardando"
        ? [sql`audit_status = 'Aguardando'`, sql`audited_by = null`, sql`audited_by_name = ''`, sql`audited_at = null`]
        : [sql`audit_status = ${status}`, sql`audited_by = ${me.sub}`, sql`audited_by_name = ${me.name}`, sql`audited_at = now()`];
    if (note) sets.push(sql`audit_note = ${note}`);

    // só o que realmente muda de status (não regrava o que já está assim: preserva quem/quando)
    const changed = await db.execute(sql`
      update payments set ${sql.join(sets, sql`, `)}
      where id in (
        select p.id ${FROM} where ${scope} and p.audit_status <> ${status}
      )
      returning id, amount::text as amount`);
    const rows = changed.rows as { id: string; amount: string }[];
    const updated = rows.length;
    const totalAmount = rows.reduce((s, r) => s + Number(r.amount), 0);

    if (updated > 0) {
      await logAudit(req, {
        action: "payment.reconcile_bulk",
        entity: "payment",
        description: `${STATUS_VERB[status].bulk} (${updated} pagamento${updated === 1 ? "" : "s"}, ${brl(totalAmount)})`,
        details: { status, quantidade: updated, total: totalAmount, ids: rows.slice(0, 50).map((r) => r.id), porFiltro: !ids },
      });
    }
    return { ok: true, updated, matched, unchanged: matched - updated };
  });
}
