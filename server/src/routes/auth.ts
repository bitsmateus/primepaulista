import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { profiles } from "../db/schema/index";
import { verifyPassword } from "../auth/password";
import { authenticate, type JwtUser } from "../plugins/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login — limite estrito contra força bruta
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "E-mail ou senha inválidos" });
    }
    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, email.toLowerCase()))
      .limit(1);

    if (!user || !user.active) {
      return reply.code(401).send({ error: "Credenciais inválidas" });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: "Credenciais inválidas" });
    }

    const token = app.jwt.sign(
      { sub: user.id, role: user.role, name: user.name } satisfies JwtUser,
      { expiresIn: "7d" }
    );

    return reply.send({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  });

  // GET /auth/me  (quem sou eu — valida o token)
  app.get("/auth/me", { preHandler: authenticate }, async (req) => {
    const jwtUser = req.user as JwtUser;
    const [user] = await db
      .select({
        id: profiles.id,
        name: profiles.name,
        email: profiles.email,
        role: profiles.role,
      })
      .from(profiles)
      .where(eq(profiles.id, jwtUser.sub))
      .limit(1);
    return { user };
  });
}
