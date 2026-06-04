import type { FastifyReply, FastifyRequest } from "fastify";

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

// Garante que o usuário tem um dos cargos permitidos
export function requireRole(...roles: JwtUser["role"][]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as JwtUser | undefined;
    if (!user) return reply.code(401).send({ error: "Não autenticado" });
    if (!roles.includes(user.role)) {
      return reply.code(403).send({ error: "Sem permissão para esta ação" });
    }
  };
}
