import type { FastifyRequest } from "fastify";
import { db } from "../db/index";
import { auditLogs } from "../db/schema/index";
import type { JwtUser } from "../plugins/auth";

interface AuditEntry {
  action: string; // ex.: "device.delete"
  entity: string; // ex.: "device"
  entityId?: string;
  description: string; // texto legível: "Excluiu o aparelho iPhone 15 256GB"
  details?: Record<string, unknown>;
}

// Registra uma ação na auditoria. Nunca lança erro: falhar em auditar
// não pode derrubar a operação principal.
export async function logAudit(req: FastifyRequest, entry: AuditEntry) {
  try {
    const user = req.user as JwtUser | undefined;
    await db.insert(auditLogs).values({
      userId: user?.sub ?? null,
      userName: user?.name ?? "",
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      description: entry.description,
      details: entry.details ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "falha ao registrar auditoria");
  }
}
