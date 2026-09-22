import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { profiles } from "../db/schema/index";
import { hashPassword, verifyPassword } from "../auth/password";
import { authenticate, type JwtUser } from "../plugins/auth";
import { logAudit } from "../services/audit";
import { getSetting } from "../services/settings";

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

    // Auditoria de falha: grava só o e-mail informado e o IP (NUNCA a senha)
    const failed = async (reason: string) =>
      logAudit(req, {
        action: "auth.login_failed",
        entity: "auth",
        entityId: user?.id,
        description: `Tentativa de login sem sucesso para ${email.toLowerCase()} (${reason})`,
        details: { email: email.toLowerCase(), reason, ip: req.ip },
        actor: { id: user?.id ?? null, name: user?.name ?? "" },
      });

    if (!user || !user.active) {
      await failed(!user ? "usuário inexistente" : "conta inativa");
      return reply.code(401).send({ error: "Credenciais inválidas" });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await failed("senha incorreta");
      return reply.code(401).send({ error: "Credenciais inválidas" });
    }

    const token = app.jwt.sign(
      { sub: user.id, role: user.role, name: user.name } satisfies JwtUser,
      { expiresIn: "7d" }
    );

    await logAudit(req, {
      action: "auth.login",
      entity: "auth",
      entityId: user.id,
      description: `${user.name} entrou no sistema`,
      details: { ip: req.ip },
      actor: { id: user.id, name: user.name },
    });

    return reply.send({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  });

  // GET /auth/branding — nome e logo da loja para a tela de login (público; sem dados sensíveis)
  app.get("/auth/branding", async () => {
    const [store, logo] = await Promise.all([getSetting("store"), getSetting("logo")]);
    return { name: store.name, slogan: store.slogan, logoDataUrl: logo.dataUrl };
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

  // POST /auth/verify-password — confere a senha do próprio usuário (desbloqueio de tela).
  // Não emite token novo. Limite estrito contra tentativa em massa.
  app.post(
    "/auth/verify-password",
    { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const parsed = z.object({ password: z.string().min(1).max(200) }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Informe a senha." });
      const me = req.user as JwtUser;
      const [user] = await db.select().from(profiles).where(eq(profiles.id, me.sub)).limit(1);
      if (!user || !user.active) return reply.code(401).send({ error: "Conta inativa ou inexistente" });
      if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
        return reply.code(400).send({ error: "Senha incorreta." }); // 400 (não 401) para o front não tratar como sessão expirada
      }
      return { ok: true };
    }
  );

  // POST /auth/change-password — o próprio usuário troca a senha.
  // Decisão: as sessões (tokens) em outros aparelhos NÃO são invalidadas (token é stateless, 7 dias).
  app.post(
    "/auth/change-password",
    { preHandler: authenticate, config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const parsed = z
        .object({
          currentPassword: z.string().min(1, "Informe a senha atual").max(200),
          newPassword: z.string().min(6, "A nova senha deve ter ao menos 6 caracteres").max(200),
          confirmPassword: z.string().max(200).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
      }
      const { currentPassword, newPassword, confirmPassword } = parsed.data;
      if (confirmPassword !== undefined && confirmPassword !== newPassword) {
        return reply.code(400).send({ error: "A confirmação da nova senha não confere." });
      }
      const me = req.user as JwtUser;
      const [user] = await db.select().from(profiles).where(eq(profiles.id, me.sub)).limit(1);
      if (!user || !user.active) return reply.code(401).send({ error: "Conta inativa ou inexistente" });
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        await logAudit(req, {
          action: "auth.change_password_failed",
          entity: "user",
          entityId: user.id,
          description: "Tentou alterar a própria senha com a senha atual incorreta",
        });
        return reply.code(400).send({ error: "A senha atual está incorreta." });
      }
      if (currentPassword === newPassword) {
        return reply.code(400).send({ error: "A nova senha deve ser diferente da atual." });
      }
      await db.update(profiles).set({ passwordHash: await hashPassword(newPassword) }).where(eq(profiles.id, user.id));
      await logAudit(req, {
        action: "auth.change_password",
        entity: "user",
        entityId: user.id,
        description: "Alterou a própria senha",
      });
      return { ok: true };
    }
  );
}
