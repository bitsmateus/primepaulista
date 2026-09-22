import type { FastifyInstance } from "fastify";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { keywordRuleHits, keywordRules } from "../db/schema/index";
import { authenticate, requireCapability } from "../plugins/auth";
import { logAudit } from "../services/audit";
import { rowToRule, simulate } from "../services/keywordReplies";
import { RULE_CATEGORIES, TZ, parseKeyword, timeToMinutes, zonedParts, type RuleSchedule } from "../lib/keywordRules";

// Regras de resposta automática por palavra-chave.
// Ver (lista, simulador, estatísticas): useCRM (admin, gerente, vendedor).
// Editar (criar, alterar, ligar/desligar, ordenar, excluir): manageAutomations (admin, gerente). Tudo auditado.

const hhmm = z.string().refine((v) => /^\d{2}:\d{2}$/.test(v) && timeToMinutes(v) !== null && v !== "24:00", "Horário inválido (use HH:MM)");
const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .refine((v) => !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v, "Data inválida");

const scheduleSchema = z.object({
  mode: z.enum(["always", "business_hours", "outside_hours", "window"]).default("always"),
  days: z.array(z.number().int().min(0).max(6)).max(7).default([0, 1, 2, 3, 4, 5, 6]),
  from: hhmm.default("09:00"),
  to: hhmm.default("19:00"),
  startDate: ymd.nullable().default(null),
  endDate: ymd.nullable().default(null),
});

const ruleBase = z.object({
  name: z.string().trim().min(1, "Informe o nome da regra").max(80),
  category: z.enum(RULE_CATEGORIES).default("Outro"),
  keywords: z.array(z.string().trim().min(1).max(60)).min(1, "Informe pelo menos uma palavra-chave").max(30),
  match: z.enum(["any", "all"]).default("any"),
  replyBody: z.string().trim().max(1000).default(""),
  action: z.enum(["reply", "ai"]).default("reply"),
  aiKind: z.enum(["preco", "troca", "os", "geral"]).default("geral"), // tipo de atendimento da IA (ação "ai")
  priority: z.number().int().min(1).max(9999).optional(),
  active: z.boolean().default(true),
  schedule: scheduleSchema.default({}),
  cooldownMinutes: z.number().int().min(0).max(10080).default(60),
});
type RuleInput = z.infer<typeof ruleBase>;
// No PATCH os campos são opcionais e SEM valor padrão (o que não veio fica como está), inclusive dentro do agendamento
const ruleBasePatch = ruleBase.partial().extend({ schedule: scheduleSchema.partial().optional() }).strict();

// Regras que dependem de mais de um campo (rodam sobre a regra completa, também no PATCH)
function crossCheck(v: RuleInput): string | null {
  if (!v.keywords.some((k) => parseKeyword(k))) return "Use pelo menos uma palavra-chave com letras ou números";
  if (v.action === "reply" && !v.replyBody.trim()) return "Escreva o texto da resposta";
  const s = v.schedule;
  if (s.startDate && s.endDate && s.startDate > s.endDate) return "A data final do período não pode ser antes da inicial";
  if (s.mode === "window") {
    if (s.days.length === 0) return "Escolha pelo menos um dia da semana para a janela de horário";
    if (s.from === s.to) return "O início e o fim da janela não podem ser iguais";
  }
  return null;
}

const uuid = z.string().uuid();
const scheduleOf = (s: RuleInput["schedule"]): RuleSchedule => ({ ...s, days: [...new Set(s.days)].sort() });

export async function keywordRuleRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  const view = requireCapability("useCRM");
  const manage = requireCapability("manageAutomations");

  // GET /keyword-rules — regras (por prioridade) com estatísticas de disparo
  app.get("/keyword-rules", { preHandler: view }, async () => {
    const rows = await db.select().from(keywordRules).orderBy(asc(keywordRules.priority), asc(keywordRules.createdAt));
    const stats = await db.execute(sql`
      select rule_id, count(*)::int as total, count(*) filter (where replied)::int as replied, max(created_at) as last
      from keyword_rule_hits group by rule_id`);
    const byRule = new Map(
      (stats.rows as { rule_id: string; total: number; replied: number; last: Date }[]).map((s) => [s.rule_id, s])
    );
    return {
      rules: rows.map((r) => {
        const s = byRule.get(r.id);
        const total = s ? Number(s.total) : 0;
        const replied = s ? Number(s.replied) : 0;
        return {
          ...rowToRule(r),
          createdAt: r.createdAt,
          stats: { total, replied, lastAt: s?.last ? new Date(s.last).toISOString() : null, rate: total ? replied / total : 0 },
        };
      }),
    };
  });

  // POST /keyword-rules/simulate — roda o motor SEM enviar nada
  app.post("/keyword-rules/simulate", { preHandler: view }, async (req, reply) => {
    const p = z
      .object({
        text: z.string().trim().min(1, "Digite a mensagem").max(1000),
        phone: z.string().trim().max(30).optional(),
        at: z.string().datetime({ offset: true }).optional(), // simular outro dia/horário (padrão: agora)
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message || "Dados inválidos" });
    return { result: await simulate({ text: p.data.text, phone: p.data.phone, now: p.data.at ? new Date(p.data.at) : undefined }) };
  });

  // GET /keyword-rules/stats?days=30 — disparos por dia e por categoria (para os gráficos)
  app.get("/keyword-rules/stats", { preHandler: view }, async (req, reply) => {
    const q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const days = q.data.days;
    const perDay = await db.execute(sql`
      select to_char((created_at AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') as d,
             count(*)::int as total, count(*) filter (where replied)::int as replied
      from keyword_rule_hits
      where created_at >= now() - (${days} * interval '1 day')
      group by 1`);
    const map = new Map((perDay.rows as { d: string; total: number; replied: number }[]).map((r) => [r.d, r]));
    const daily: { date: string; total: number; replied: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = zonedParts(new Date(Date.now() - i * 86_400_000)).date;
      const r = map.get(date);
      daily.push({ date, total: r ? Number(r.total) : 0, replied: r ? Number(r.replied) : 0 });
    }
    const perCat = await db.execute(sql`
      select r.category, count(h.id)::int as total, count(h.id) filter (where h.replied)::int as replied
      from keyword_rule_hits h join keyword_rules r on r.id = h.rule_id
      where h.created_at >= now() - (${days} * interval '1 day')
      group by r.category order by total desc`);
    return {
      days,
      daily,
      byCategory: (perCat.rows as { category: string; total: number; replied: number }[]).map((r) => ({
        category: r.category, total: Number(r.total), replied: Number(r.replied),
      })),
    };
  });

  // GET /keyword-rules/hits?limit=50&ruleId= — últimos disparos
  app.get("/keyword-rules/hits", { preHandler: view }, async (req, reply) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), ruleId: uuid.optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const base = db
      .select({
        id: keywordRuleHits.id,
        ruleId: keywordRuleHits.ruleId,
        ruleName: keywordRules.name,
        phone: keywordRuleHits.phone,
        leadId: keywordRuleHits.leadId,
        inboundText: keywordRuleHits.inboundText,
        matched: keywordRuleHits.matched,
        replied: keywordRuleHits.replied,
        error: keywordRuleHits.error,
        reviewId: keywordRuleHits.reviewId,
        createdAt: keywordRuleHits.createdAt,
      })
      .from(keywordRuleHits)
      .innerJoin(keywordRules, eq(keywordRules.id, keywordRuleHits.ruleId));
    const rows = await (q.data.ruleId ? base.where(eq(keywordRuleHits.ruleId, q.data.ruleId)) : base)
      .orderBy(desc(keywordRuleHits.createdAt))
      .limit(q.data.limit);
    return { hits: rows };
  });

  // POST /keyword-rules/reorder { ids } — nova ordem de prioridade (todos os ids, sem repetir)
  app.post("/keyword-rules/reorder", { preHandler: manage }, async (req, reply) => {
    const p = z.object({ ids: z.array(uuid).min(1).max(500) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos" });
    const rows = await db.select({ id: keywordRules.id }).from(keywordRules);
    const have = new Set(rows.map((r) => r.id));
    const given = new Set(p.data.ids);
    if (given.size !== p.data.ids.length || given.size !== have.size || [...given].some((id) => !have.has(id))) {
      return reply.code(400).send({ error: "A lista precisa ter todas as regras, sem repetir" });
    }
    await db.transaction(async (tx) => {
      for (let i = 0; i < p.data.ids.length; i++) {
        await tx.update(keywordRules).set({ priority: i + 1 }).where(eq(keywordRules.id, p.data.ids[i]));
      }
    });
    await logAudit(req, {
      action: "keyword_rule.reorder",
      entity: "keyword_rule",
      description: "Mudou a ordem de prioridade das respostas automáticas",
    });
    return { ok: true };
  });

  // POST /keyword-rules
  app.post("/keyword-rules", { preHandler: manage }, async (req, reply) => {
    const p = ruleBase.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message || "Dados inválidos" });
    const bad = crossCheck(p.data);
    if (bad) return reply.code(400).send({ error: bad });
    const d = p.data;
    let priority = d.priority;
    if (!priority) {
      const [agg] = await db.select({ max: sql<number>`coalesce(max(${keywordRules.priority}), 0)` }).from(keywordRules);
      priority = Number(agg.max) + 1;
    }
    const user = req.user as { sub: string };
    const [row] = await db
      .insert(keywordRules)
      .values({
        name: d.name,
        category: d.category,
        keywords: [...new Set(d.keywords)],
        match: d.match,
        replyBody: d.replyBody,
        action: d.action,
        aiKind: d.aiKind,
        priority,
        active: d.active,
        schedule: scheduleOf(d.schedule),
        cooldownMinutes: d.cooldownMinutes,
        createdBy: user.sub,
      })
      .returning();
    await logAudit(req, {
      action: "keyword_rule.create",
      entity: "keyword_rule",
      entityId: row.id,
      description: `Criou a resposta automática "${row.name}" (${row.category})`,
      details: { palavras: row.keywords, modo: row.match, acao: row.action, tipoIA: row.action === "ai" ? row.aiKind : undefined, ativa: row.active },
    });
    return reply.code(201).send({ rule: rowToRule(row) });
  });

  // PATCH /keyword-rules/:id — altera campos (inclui ligar/desligar)
  app.patch("/keyword-rules/:id", { preHandler: manage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const p = ruleBasePatch.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message || "Dados inválidos" });
    if (Object.keys(p.data).length === 0) return reply.code(400).send({ error: "Nada para alterar" });
    const [cur] = await db.select().from(keywordRules).where(eq(keywordRules.id, id)).limit(1);
    if (!cur) return reply.code(404).send({ error: "Regra não encontrada" });

    const curRule = rowToRule(cur);
    const merged: RuleInput = {
      name: p.data.name ?? curRule.name,
      category: (p.data.category ?? curRule.category) as RuleInput["category"],
      keywords: p.data.keywords ?? curRule.keywords,
      match: p.data.match ?? curRule.match,
      replyBody: p.data.replyBody ?? curRule.replyBody,
      action: p.data.action ?? curRule.action,
      aiKind: p.data.aiKind ?? curRule.aiKind ?? "geral",
      priority: p.data.priority ?? curRule.priority,
      active: p.data.active ?? curRule.active,
      schedule: p.data.schedule ? scheduleSchema.parse({ ...curRule.schedule, ...p.data.schedule }) : curRule.schedule,
      cooldownMinutes: p.data.cooldownMinutes ?? curRule.cooldownMinutes,
    };
    const bad = crossCheck(merged);
    if (bad) return reply.code(400).send({ error: bad });

    const [row] = await db
      .update(keywordRules)
      .set({
        name: merged.name,
        category: merged.category,
        keywords: [...new Set(merged.keywords)],
        match: merged.match,
        replyBody: merged.replyBody,
        action: merged.action,
        aiKind: merged.aiKind,
        priority: merged.priority,
        active: merged.active,
        schedule: scheduleOf(merged.schedule),
        cooldownMinutes: merged.cooldownMinutes,
      })
      .where(eq(keywordRules.id, id))
      .returning();

    const onlyToggle = Object.keys(p.data).length === 1 && p.data.active !== undefined;
    await logAudit(req, {
      action: onlyToggle ? "keyword_rule.toggle" : "keyword_rule.update",
      entity: "keyword_rule",
      entityId: id,
      description: onlyToggle
        ? `${row.active ? "Ligou" : "Desligou"} a resposta automática "${row.name}"`
        : `Alterou a resposta automática "${row.name}"`,
      details: { campos: Object.keys(p.data) },
    });
    return { rule: rowToRule(row) };
  });

  // DELETE /keyword-rules/:id (apaga também o histórico de disparos da regra)
  app.delete("/keyword-rules/:id", { preHandler: manage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const [row] = await db.delete(keywordRules).where(eq(keywordRules.id, id)).returning();
    if (!row) return reply.code(404).send({ error: "Regra não encontrada" });
    await logAudit(req, {
      action: "keyword_rule.delete",
      entity: "keyword_rule",
      entityId: id,
      description: `Excluiu a resposta automática "${row.name}"`,
    });
    return { ok: true };
  });
}
