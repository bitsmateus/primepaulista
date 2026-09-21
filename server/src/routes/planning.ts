import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { profiles, weeklyTasks, type WeeklyTask } from "../db/schema/index";
import { authenticate, currentRole, requireCapability, requireLogin, type JwtUser } from "../plugins/auth";
import { can } from "../lib/permissions";
import { logAudit } from "../services/audit";
import { claimAndSendTaskWhatsapp, dayLabel, isMonday, sendTaskWhatsapp } from "../services/planning";

// Planejamento semanal. Qualquer usuário logado vê e conclui as PRÓPRIAS tarefas;
// criar, editar, atribuir, mover e excluir exige a capacidade `managePlanning` (admin, gerente).

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").refine(isMonday, "A semana deve começar na segunda-feira");

const baseFields = {
  weekStart: dateStr,
  weekday: z.coerce.number().int().min(0).max(6),
  title: z.string().trim().min(1, "Informe o título").max(200),
  description: z.string().trim().max(1000).optional().default(""),
  assigneeId: z.string().uuid().nullable().optional(),
  remindAt: z.string().datetime({ offset: true }).nullable().optional(),
  reminderMessage: z.string().trim().max(500).optional().default(""),
};
const createSchema = z.object(baseFields);
const updateSchema = z
  .object({
    weekStart: baseFields.weekStart,
    weekday: baseFields.weekday,
    title: baseFields.title,
    description: z.string().trim().max(1000),
    assigneeId: baseFields.assigneeId,
    remindAt: baseFields.remindAt,
    reminderMessage: z.string().trim().max(500),
    done: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nada para alterar");

const mapTask = (t: WeeklyTask) => ({
  id: t.id,
  weekStart: t.weekStart,
  weekday: t.weekday,
  title: t.title,
  description: t.description,
  assigneeId: t.assigneeId,
  assigneeName: t.assigneeName,
  done: t.done,
  doneAt: t.doneAt ? t.doneAt.toISOString() : null,
  remindAt: t.remindAt ? t.remindAt.toISOString() : null,
  remindedAt: t.remindedAt ? t.remindedAt.toISOString() : null,
  reminderMessage: t.reminderMessage,
  whatsappStatus: t.whatsappStatus,
  whatsappError: t.whatsappError,
  whatsappAt: t.whatsappAt ? t.whatsappAt.toISOString() : null,
  createdByName: t.createdByName,
  createdAt: t.createdAt.toISOString(),
});

async function assignee(id: string) {
  const [p] = await db.select({ id: profiles.id, name: profiles.name, active: profiles.active }).from(profiles).where(eq(profiles.id, id)).limit(1);
  return p && p.active ? p : null;
}

export async function planningRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /planning/tasks?weekStart=YYYY-MM-DD — quem gerencia vê todas; os demais, só as próprias
  app.get("/planning/tasks", { preHandler: requireLogin }, async (req, reply) => {
    const q = z.object({ weekStart: dateStr }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "Informe weekStart (uma segunda-feira, AAAA-MM-DD)" });
    const me = req.user as JwtUser;
    const all = can(currentRole(req), "managePlanning");
    const rows = await db
      .select()
      .from(weeklyTasks)
      .where(all ? eq(weeklyTasks.weekStart, q.data.weekStart) : and(eq(weeklyTasks.weekStart, q.data.weekStart), eq(weeklyTasks.assigneeId, me.sub)))
      .orderBy(asc(weeklyTasks.weekday), asc(weeklyTasks.createdAt));
    return { tasks: rows.map(mapTask), canManage: all };
  });

  // GET /planning/assignees — colaboradores ativos para atribuir tarefas
  app.get("/planning/assignees", { preHandler: requireCapability("managePlanning") }, async () => {
    const rows = await db.select({ id: profiles.id, name: profiles.name, role: profiles.role, phone: profiles.phone }).from(profiles).where(eq(profiles.active, true)).orderBy(asc(profiles.name));
    return { assignees: rows.map((r) => ({ id: r.id, name: r.name, role: r.role, hasPhone: !!(r.phone && r.phone.replace(/\D/g, "").length >= 10) })) };
  });

  // POST /planning/tasks
  app.post("/planning/tasks", { preHandler: requireCapability("managePlanning") }, async (req, reply) => {
    const p = createSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos", details: p.error.flatten().fieldErrors });
    const d = p.data;
    const me = req.user as JwtUser;
    if (d.remindAt && !d.assigneeId) return reply.code(400).send({ error: "Para lembrar alguém, escolha o responsável." });
    let assigneeName = "";
    if (d.assigneeId) {
      const a = await assignee(d.assigneeId);
      if (!a) return reply.code(400).send({ error: "Responsável não encontrado ou inativo." });
      assigneeName = a.name;
    }
    const [row] = await db
      .insert(weeklyTasks)
      .values({
        weekStart: d.weekStart,
        weekday: d.weekday,
        title: d.title,
        description: d.description,
        assigneeId: d.assigneeId ?? null,
        assigneeName,
        remindAt: d.remindAt ? new Date(d.remindAt) : null,
        reminderMessage: d.reminderMessage,
        createdBy: me.sub,
        createdByName: me.name,
      })
      .returning();
    await logAudit(req, {
      action: "planning.create",
      entity: "weekly_task",
      entityId: row.id,
      description: `Criou a tarefa "${row.title}" para ${dayLabel(row.weekStart, row.weekday)}${assigneeName ? ` (responsável: ${assigneeName})` : ""}`,
      details: { semana: row.weekStart, dia: row.weekday, responsavel: assigneeName || null, lembrete: d.remindAt ?? null },
    });
    // Lembrete já vencido ("lembrar agora"): envia o WhatsApp na hora (falha nunca quebra o salvamento)
    let whatsapp = null;
    if (row.remindAt && row.assigneeId && row.remindAt.getTime() <= Date.now()) {
      whatsapp = await claimAndSendTaskWhatsapp(row.id);
    }
    const [fresh] = await db.select().from(weeklyTasks).where(eq(weeklyTasks.id, row.id)).limit(1);
    return reply.code(201).send({ task: mapTask(fresh), whatsapp });
  });

  // PATCH /planning/tasks/:id — gerente edita/move/atribui; o responsável só marca a PRÓPRIA como feita
  app.patch("/planning/tasks/:id", { preHandler: requireLogin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const p = updateSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "Dados inválidos", details: p.error.flatten().fieldErrors });
    const d = p.data;
    const me = req.user as JwtUser;
    const manager = can(currentRole(req), "managePlanning");

    const [cur] = await db.select().from(weeklyTasks).where(eq(weeklyTasks.id, id)).limit(1);
    if (!cur) return reply.code(404).send({ error: "Tarefa não encontrada" });

    if (!manager) {
      if (cur.assigneeId !== me.sub) return reply.code(403).send({ error: "Sem permissão para esta ação" });
      if (Object.keys(d).some((k) => k !== "done")) return reply.code(403).send({ error: "Você só pode marcar a sua tarefa como feita." });
    }

    const set: Partial<typeof weeklyTasks.$inferInsert> = {};
    if (d.title !== undefined) set.title = d.title;
    if (d.description !== undefined) set.description = d.description;
    if (d.weekStart !== undefined) set.weekStart = d.weekStart;
    if (d.weekday !== undefined) set.weekday = d.weekday;
    if (d.reminderMessage !== undefined) set.reminderMessage = d.reminderMessage;
    if (d.done !== undefined && d.done !== cur.done) {
      set.done = d.done;
      set.doneAt = d.done ? new Date() : null;
    }

    let nextAssignee = cur.assigneeId;
    if (d.assigneeId !== undefined) {
      if (d.assigneeId === null) {
        set.assigneeId = null;
        set.assigneeName = "";
        nextAssignee = null;
      } else if (d.assigneeId !== cur.assigneeId) {
        const a = await assignee(d.assigneeId);
        if (!a) return reply.code(400).send({ error: "Responsável não encontrado ou inativo." });
        set.assigneeId = a.id;
        set.assigneeName = a.name;
        nextAssignee = a.id;
      }
    }
    const nextRemind = d.remindAt !== undefined ? (d.remindAt ? new Date(d.remindAt) : null) : cur.remindAt;
    if (nextRemind && !nextAssignee) return reply.code(400).send({ error: "Para lembrar alguém, escolha o responsável." });
    if (!nextAssignee) set.remindAt = null;

    // Mudou o responsável ou o horário do lembrete: o lembrete volta a valer (nova entrega)
    const remindChanged =
      (d.remindAt !== undefined && (nextRemind?.getTime() ?? null) !== (cur.remindAt?.getTime() ?? null)) ||
      (d.assigneeId !== undefined && d.assigneeId !== cur.assigneeId);
    if (d.remindAt !== undefined) set.remindAt = nextRemind;
    if (remindChanged) {
      set.remindedAt = null;
      set.whatsappStatus = null;
      set.whatsappError = null;
      set.whatsappAt = null;
    }

    if (Object.keys(set).length === 0) return { task: mapTask(cur), whatsapp: null };
    await db.update(weeklyTasks).set(set).where(eq(weeklyTasks.id, id));

    let whatsapp = null;
    if (remindChanged && nextRemind && nextAssignee && nextRemind.getTime() <= Date.now() && !(set.done ?? cur.done)) {
      whatsapp = await claimAndSendTaskWhatsapp(id);
    }
    const [fresh] = await db.select().from(weeklyTasks).where(eq(weeklyTasks.id, id)).limit(1);
    return { task: mapTask(fresh), whatsapp };
  });

  // POST /planning/tasks/:id/remind — "Lembrar agora" (reenvia o WhatsApp e volta a avisar no sistema)
  app.post("/planning/tasks/:id/remind", { preHandler: requireCapability("managePlanning") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const [cur] = await db.select().from(weeklyTasks).where(eq(weeklyTasks.id, id)).limit(1);
    if (!cur) return reply.code(404).send({ error: "Tarefa não encontrada" });
    if (!cur.assigneeId) return reply.code(400).send({ error: "A tarefa não tem responsável." });
    const now = new Date();
    const [upd] = await db
      .update(weeklyTasks)
      .set({ remindAt: now, remindedAt: null, whatsappAt: now })
      .where(eq(weeklyTasks.id, id))
      .returning();
    const whatsapp = await sendTaskWhatsapp(upd);
    await logAudit(req, {
      action: "planning.remind",
      entity: "weekly_task",
      entityId: id,
      description: `Lembrou ${cur.assigneeName} da tarefa "${cur.title}"`,
      details: { whatsapp: whatsapp?.status ?? null },
    });
    const [fresh] = await db.select().from(weeklyTasks).where(eq(weeklyTasks.id, id)).limit(1);
    return { task: mapTask(fresh), whatsapp };
  });

  // DELETE /planning/tasks/:id
  app.delete("/planning/tasks/:id", { preHandler: requireCapability("managePlanning") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const [cur] = await db.select().from(weeklyTasks).where(eq(weeklyTasks.id, id)).limit(1);
    if (!cur) return reply.code(404).send({ error: "Tarefa não encontrada" });
    await db.delete(weeklyTasks).where(eq(weeklyTasks.id, id));
    await logAudit(req, {
      action: "planning.delete",
      entity: "weekly_task",
      entityId: id,
      description: `Excluiu a tarefa "${cur.title}" de ${dayLabel(cur.weekStart, cur.weekday)}${cur.assigneeName ? ` (responsável: ${cur.assigneeName})` : ""}`,
      details: { semana: cur.weekStart, dia: cur.weekday, responsavel: cur.assigneeName || null, feita: cur.done },
    });
    return { ok: true };
  });
}
