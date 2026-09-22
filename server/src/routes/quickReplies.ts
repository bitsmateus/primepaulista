import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { appSettings, quickReplies } from "../db/schema/index";
import { authenticate, currentRole, requireCapability, type JwtUser } from "../plugins/auth";
import { can } from "../lib/permissions";
import { DEFAULT_QUICK_REPLIES } from "../lib/crmText";
import { logAudit } from "../services/audit";

// Respostas rápidas (modelos de mensagem do CRM). Ver: useCRM (admin, gerente, vendedor).
// Editar (criar, alterar, excluir): manageAutomations (admin, gerente). O vendedor só usa (e só vê as ativas).
const SEED_MARKER = "quick_replies_seeded";

const replyInput = z.object({
  title: z.string().trim().min(1, "Informe o título").max(80),
  body: z.string().trim().min(1, "Escreva o texto da resposta").max(1500),
  category: z.string().trim().min(1).max(40).default("Outro"),
  active: z.boolean().default(true),
});

// Semeia os modelos padrão UMA vez, e só se a loja ainda não tiver nenhuma resposta rápida
async function seedDefaultsOnce() {
  await db.transaction(async (tx) => {
    const marker = await tx
      .insert(appSettings)
      .values({ key: SEED_MARKER, value: { at: new Date().toISOString() } as never })
      .onConflictDoNothing()
      .returning({ key: appSettings.key });
    if (marker.length === 0) return; // já semeado antes (mesmo que tenham apagado tudo depois)
    const any = await tx.select({ id: quickReplies.id }).from(quickReplies).limit(1);
    if (any.length === 0) await tx.insert(quickReplies).values(DEFAULT_QUICK_REPLIES);
  });
}

export async function quickReplyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/quick-replies", { preHandler: requireCapability("useCRM") }, async (req) => {
    await seedDefaultsOnce();
    const rows = await db.select().from(quickReplies).orderBy(asc(quickReplies.category), asc(quickReplies.title));
    const canManage = can(currentRole(req), "manageAutomations");
    return { quickReplies: canManage ? rows : rows.filter((r) => r.active) };
  });

  app.post("/quick-replies", { preHandler: requireCapability("manageAutomations") }, async (req, reply) => {
    const p = replyInput.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message || "Dados inválidos" });
    const user = req.user as JwtUser;
    const [row] = await db.insert(quickReplies).values({ ...p.data, createdBy: user.sub }).returning();
    await logAudit(req, {
      action: "quick_reply.create",
      entity: "quick_reply",
      entityId: row.id,
      description: `Criou a resposta rápida "${row.title}"`,
    });
    return reply.code(201).send({ quickReply: row });
  });

  app.patch("/quick-replies/:id", { preHandler: requireCapability("manageAutomations") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const p = replyInput.partial().safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message || "Dados inválidos" });
    if (Object.keys(p.data).length === 0) return reply.code(400).send({ error: "Nada para alterar" });
    const [row] = await db.update(quickReplies).set(p.data).where(eq(quickReplies.id, id)).returning();
    if (!row) return reply.code(404).send({ error: "Resposta rápida não encontrada" });
    await logAudit(req, {
      action: "quick_reply.update",
      entity: "quick_reply",
      entityId: id,
      description: `Alterou a resposta rápida "${row.title}"`,
      details: { campos: Object.keys(p.data) },
    });
    return { quickReply: row };
  });

  app.delete("/quick-replies/:id", { preHandler: requireCapability("manageAutomations") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: "Identificador inválido" });
    const [row] = await db.delete(quickReplies).where(eq(quickReplies.id, id)).returning();
    if (!row) return reply.code(404).send({ error: "Resposta rápida não encontrada" });
    await logAudit(req, {
      action: "quick_reply.delete",
      entity: "quick_reply",
      entityId: id,
      description: `Excluiu a resposta rápida "${row.title}"`,
    });
    return { ok: true };
  });
}
