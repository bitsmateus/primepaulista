import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { profiles } from "../db/schema/index";

// Conteúdo do token JWT
export interface JwtUser {
  sub: string; // id do profile
  role: "admin" | "vendedor" | "tecnico";
  name: string;
}

// Garante que a requisição tem um token válido
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Não autenticado" });
  }
}

// Garante que o usuário tem um dos cargos permitidos.
// Revalida no banco (cargo atual + conta ativa), então rebaixar/desativar
// um usuário tem efeito imediato, mesmo com token ainda válido.
export function requireRole(...roles: JwtUser["role"][]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const jwtUser = req.user as JwtUser | undefined;
    if (!jwtUser) return reply.code(401).send({ error: "Não autenticado" });

    const [profile] = await db
      .select({ role: profiles.role, active: profiles.active })
      .from(profiles)
      .where(eq(profiles.id, jwtUser.sub))
      .limit(1);

    if (!profile || !profile.active) {
      return reply.code(401).send({ error: "Conta inativa ou inexistente" });
    }
    if (!roles.includes(profile.role)) {
      return reply.code(403).send({ error: "Sem permissão para esta ação" });
    }
  };
}
