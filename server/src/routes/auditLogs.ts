import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { auditLogs } from "../db/schema/index";
import { authenticate, requireCapability } from "../plugins/auth";

// Data (AAAA-MM-DD) no fuso de Brasília; aceita também ISO completo
function parseDay(v: string, endOfDay: boolean): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00-03:00`);
    if (Number.isNaN(d.getTime())) return null;
    if (endOfDay) d.setUTCDate(d.getUTCDate() + 1); // limite exclusivo: dia seguinte 00:00
    return d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const filterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  userId: z.string().uuid().optional(),
  action: z.string().max(200).optional(), // uma ou várias (separadas por vírgula)
  entity: z.string().max(100).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

function buildWhere(f: z.infer<typeof filterSchema>): SQL | undefined | "invalid" {
  const conds: SQL[] = [];
  if (f.from) {
    const d = parseDay(f.from, false);
    if (!d) return "invalid";
    conds.push(gte(auditLogs.createdAt, d));
  }
  if (f.to) {
    const d = parseDay(f.to, true);
    if (!d) return "invalid";
    conds.push(lt(auditLogs.createdAt, d));
  }
  if (f.userId) conds.push(eq(auditLogs.userId, f.userId));
  if (f.action) {
    const list = f.action.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length) conds.push(inArray(auditLogs.action, list));
  }
  if (f.entity) conds.push(eq(auditLogs.entity, f.entity));
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(
        ilike(auditLogs.description, like),
        ilike(auditLogs.userName, like),
        ilike(auditLogs.action, like),
        ilike(auditLogs.entityId, like)
      ) as SQL
    );
  }
  return conds.length ? and(...conds) : undefined;
}

const csvCell = (v: unknown) => {
  let s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // evita fórmula ao abrir no Excel
  return `"${s.replace(/"/g, '""')}"`;
};

// Auditoria: somente leitura, capacidade viewAudit (admin, gerente)
export async function auditLogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireCapability("viewAudit"));

  // GET /audit-logs — filtros + paginação no servidor, mais recentes primeiro
  app.get("/audit-logs", async (req, reply) => {
    const parsed = filterSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Filtros inválidos" });
    const where = buildWhere(parsed.data);
    if (where === "invalid") return reply.code(400).send({ error: "Data inválida" });
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where);
    const rows = await db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(parsed.data.limit)
      .offset(parsed.data.offset);
    return { logs: rows, total, limit: parsed.data.limit, offset: parsed.data.offset };
  });

  // GET /audit-logs/filters — valores para os filtros da tela
  app.get("/audit-logs/filters", async () => {
    const [users, actions, entities] = await Promise.all([
      db.selectDistinct({ id: auditLogs.userId, name: auditLogs.userName }).from(auditLogs),
      db.selectDistinct({ action: auditLogs.action }).from(auditLogs).orderBy(auditLogs.action),
      db.selectDistinct({ entity: auditLogs.entity }).from(auditLogs).orderBy(auditLogs.entity),
    ]);
    return {
      users: users.filter((u) => u.id),
      actions: actions.map((a) => a.action),
      entities: entities.map((e) => e.entity).filter(Boolean),
    };
  });

  // GET /audit-logs/export — CSV com os mesmos filtros (até 20 mil linhas)
  app.get("/audit-logs/export", async (req, reply) => {
    const parsed = filterSchema.omit({ limit: true, offset: true }).safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Filtros inválidos" });
    const where = buildWhere({ ...parsed.data, limit: 50, offset: 0 });
    if (where === "invalid") return reply.code(400).send({ error: "Data inválida" });
    const rows = await db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(20000);
    const head = ["Data/hora", "Usuário", "Ação", "Descrição", "Entidade", "ID", "Detalhes"];
    const lines = rows.map((r) =>
      [r.createdAt.toISOString(), r.userName, r.action, r.description, r.entity, r.entityId, r.details]
        .map(csvCell)
        .join(",")
    );
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="auditoria.csv"');
    return "﻿" + [head.map(csvCell).join(","), ...lines].join("\r\n");
  });
}
