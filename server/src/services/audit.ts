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
  // Quem fez, quando ainda não há usuário no token (ex.: login)
  actor?: { id: string | null; name: string };
}

// Chaves que nunca devem ir para `details` (senhas, tokens, valores de variáveis)
const SECRET_KEY = /pass|senha|secret|token|api_?key|hash|value_?enc/i;

// Remove qualquer campo com nome de segredo (defesa extra: quem chama já não deve enviar)
export function scrubDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!details) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (SECRET_KEY.test(k)) continue;
    out[k] = v;
  }
  return out;
}

// Registra uma ação na auditoria. Nunca lança erro: falhar em auditar
// não pode derrubar a operação principal.
export async function logAudit(req: FastifyRequest, entry: AuditEntry) {
  try {
    const user = req.user as JwtUser | undefined;
    await db.insert(auditLogs).values({
      userId: entry.actor ? entry.actor.id : (user?.sub ?? null),
      userName: entry.actor ? entry.actor.name : (user?.name ?? ""),
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      description: entry.description,
      details: scrubDetails(entry.details),
    });
  } catch (err) {
    req.log.error({ err }, "falha ao registrar auditoria");
  }
}

export const brl = (v: number | string | null | undefined): string => {
  const n = Number(v ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

// Compara campos de duas versões de um registro e devolve só o que mudou ({campo: {de, para}})
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<Record<keyof T, unknown>>,
  fields: (keyof T)[]
): Record<string, { de: unknown; para: unknown }> {
  const out: Record<string, { de: unknown; para: unknown }> = {};
  for (const f of fields) {
    if (!(f in after) || after[f] === undefined) continue;
    const a = norm(before[f]);
    const b = norm(after[f]);
    if (a !== b) out[String(f)] = { de: before[f] ?? null, para: after[f] ?? null };
  }
  return out;
}
function norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return String(Number(v));
  return String(v);
}
