import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { profiles } from "../db/schema/index";
import { can, type Capability, type Role } from "../lib/permissions";

// Conteúdo do token JWT
export interface JwtUser {
  sub: string; // id do profile
  role: Role;
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

// Garante que o usuário tem a capacidade exigida (ver src/lib/permissions.ts).
// Com mais de uma capacidade, basta ter UMA delas.
// Revalida no banco (cargo atual + conta ativa), então rebaixar/desativar
// um usuário tem efeito imediato, mesmo com token ainda válido.
// Use como preHandler; ela responde 401/403 sozinha (teste reply.sent se chamar à mão).
export function requireCapability(...capabilities: Capability[]) {
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
    if (!capabilities.some((c) => can(profile.role, c))) {
      return reply.code(403).send({ error: "Sem permissão para esta ação" });
    }
    // Deixa o cargo atual (do banco) disponível para a rota
    (req as FastifyRequest & { currentRole?: Role }).currentRole = profile.role;
  };
}

// Só exige estar logado e com a conta ativa (qualquer cargo). Também deixa o cargo atual disponível.
export async function requireLogin(req: FastifyRequest, reply: FastifyReply) {
  const jwtUser = req.user as JwtUser | undefined;
  if (!jwtUser) return reply.code(401).send({ error: "Não autenticado" });
  const [profile] = await db
    .select({ role: profiles.role, active: profiles.active })
    .from(profiles)
    .where(eq(profiles.id, jwtUser.sub))
    .limit(1);
  if (!profile || !profile.active) return reply.code(401).send({ error: "Conta inativa ou inexistente" });
  (req as FastifyRequest & { currentRole?: Role }).currentRole = profile.role;
}

// Cargo atual do usuário (preenchido por requireCapability); cai para o do token
export function currentRole(req: FastifyRequest): Role {
  return (req as FastifyRequest & { currentRole?: Role }).currentRole ?? (req.user as JwtUser).role;
}
