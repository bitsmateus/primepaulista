import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { profiles } from "../db/schema/index";
import { hashPassword } from "../auth/password";
import { authenticate, requireRole } from "../plugins/auth";

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
  role: z.enum(["admin", "vendedor", "tecnico"]),
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
}
