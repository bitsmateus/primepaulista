import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { profiles } from "../db/schema/index";
import { hashPassword } from "../auth/password";
import { authenticate, requireRole, type JwtUser } from "../plugins/auth";

const createUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres").max(200),
  role: z.enum(["admin", "vendedor", "tecnico"]),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(["admin", "vendedor", "tecnico"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).max(200).optional(),
});

// Todas as rotas exigem login + cargo admin
export async function userRoutes(app: FastifyInstance) {
  // GET /users — lista funcionários
  app.get(
    "/users",
    { preHandler: [authenticate, requireRole("admin")] },
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
    { preHandler: [authenticate, requireRole("admin")] },
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

      return reply.code(201).send({ user: created });
    }
  );

  // PATCH /users/:id — alterar cargo, ativar/desativar ou resetar senha
  app.patch(
    "/users/:id",
    { preHandler: [authenticate, requireRole("admin")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Dados inválidos" });
      }
      const me = (req.user as JwtUser).sub;

      // Proteção: o admin não pode rebaixar/desativar a si mesmo (evita travar o sistema)
      if (id === me) {
        if (parsed.data.role && parsed.data.role !== "admin") {
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
      return { user: updated };
    }
  );
}
