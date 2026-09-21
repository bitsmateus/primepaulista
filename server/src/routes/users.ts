import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { profiles } from "../db/schema/index";
import { hashPassword } from "../auth/password";
import { authenticate, requireCapability, type JwtUser } from "../plugins/auth";
import { ROLES, ROLE_LABELS, can } from "../lib/permissions";
import { logAudit } from "../services/audit";

const createUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres").max(200),
  role: z.enum(ROLES),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).max(200).optional(),
});

// Todas as rotas exigem login + capacidade manageUsers (só admin)
export async function userRoutes(app: FastifyInstance) {
  // GET /users — lista funcionários
  app.get(
    "/users",
    { preHandler: [authenticate, requireCapability("manageUsers")] },
    async () => {
      const list = await db
        .select({
          id: profiles.id,
          name: profiles.name,
          email: profiles.email,
          role: profiles.role,
          active: profiles.active,
          createdAt: profiles.createdAt,
        })
        .from(profiles);
      return { users: list };
    }
  );

  // POST /users — admin cadastra novo funcionário
  app.post(
    "/users",
    { preHandler: [authenticate, requireCapability("manageUsers")] },
    async (req, reply) => {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      }
      const { name, email, password, role } = parsed.data;

      const existing = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.email, email.toLowerCase()))
        .limit(1);
      if (existing.length > 0) {
        return reply.code(409).send({ error: "Já existe usuário com este e-mail" });
      }

      const [created] = await db
        .insert(profiles)
        .values({
          name,
          email: email.toLowerCase(),
          passwordHash: await hashPassword(password),
          role,
        })
        .returning({
          id: profiles.id,
          name: profiles.name,
          email: profiles.email,
          role: profiles.role,
        });

      await logAudit(req, {
        action: "user.create",
        entity: "user",
        entityId: created.id,
        description: `Criou o usuário ${created.name} (${created.email}) com o cargo ${ROLE_LABELS[created.role]}`,
        details: { role: created.role },
      });
      return reply.code(201).send({ user: created });
    }
  );

  // PATCH /users/:id — alterar cargo, ativar/desativar ou resetar senha
  app.patch(
    "/users/:id",
    { preHandler: [authenticate, requireCapability("manageUsers")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dados inválidos" });
      }
      const me = (req.user as JwtUser).sub;

      // Proteção: o admin não pode rebaixar/desativar a si mesmo (evita travar o sistema)
      if (id === me) {
        if (parsed.data.role && !can(parsed.data.role, "manageUsers")) {
          return reply.code(400).send({ error: "Você não pode mudar o seu próprio cargo." });
        }
        if (parsed.data.active === false) {
          return reply.code(400).send({ error: "Você não pode desativar a si mesmo." });
        }
      }

      const values: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) values.name = parsed.data.name;
      if (parsed.data.role !== undefined) values.role = parsed.data.role;
      if (parsed.data.active !== undefined) values.active = parsed.data.active;
      if (parsed.data.password !== undefined) {
        values.passwordHash = await hashPassword(parsed.data.password);
      }
      if (Object.keys(values).length === 0) {
        return reply.code(400).send({ error: "Nada para atualizar." });
      }

      const [before] = await db
        .select({ name: profiles.name, role: profiles.role, active: profiles.active })
        .from(profiles)
        .where(eq(profiles.id, id))
        .limit(1);
      if (!before) return reply.code(404).send({ error: "Usuário não encontrado" });

      const [updated] = await db
        .update(profiles)
        .set(values)
        .where(eq(profiles.id, id))
        .returning({
          id: profiles.id,
          name: profiles.name,
          email: profiles.email,
          role: profiles.role,
          active: profiles.active,
        });
      if (!updated) return reply.code(404).send({ error: "Usuário não encontrado" });

      // Auditoria (nunca grava a senha, nem o hash)
      if (parsed.data.role !== undefined && parsed.data.role !== before.role) {
        await logAudit(req, {
          action: "user.role_change",
          entity: "user",
          entityId: id,
          description: `Mudou o cargo de ${updated.name}: ${ROLE_LABELS[before.role]} → ${ROLE_LABELS[updated.role]}`,
          details: { de: before.role, para: updated.role },
        });
      }
      if (parsed.data.active !== undefined && parsed.data.active !== before.active) {
        await logAudit(req, {
          action: updated.active ? "user.activate" : "user.deactivate",
          entity: "user",
          entityId: id,
          description: `${updated.active ? "Reativou" : "Desativou"} o usuário ${updated.name}`,
        });
      }
      if (parsed.data.password !== undefined) {
        await logAudit(req, {
          action: "user.password_reset",
          entity: "user",
          entityId: id,
          description: `Redefiniu a senha de ${updated.name}`,
        });
      }
      if (parsed.data.name !== undefined && parsed.data.name !== before.name) {
        await logAudit(req, {
          action: "user.rename",
          entity: "user",
          entityId: id,
          description: `Renomeou o usuário ${before.name} para ${updated.name}`,
        });
      }
      return { user: updated };
    }
  );
}
