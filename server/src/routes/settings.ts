import type { FastifyInstance } from "fastify";
import { authenticate, requireRole, type JwtUser } from "../plugins/auth";
import { logAudit } from "../services/audit";
import { SETTINGS, getSetting, isSettingKey, saveSetting } from "../services/settings";

// Configurações da loja (chave -> JSON). Leitura: qualquer usuário logado.
// Gravação: somente admin. Só chaves registradas em services/settings.ts.
export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/settings/:key", async (req, reply) => {
    const { key } = req.params as { key: string };
    if (!isSettingKey(key)) return reply.code(400).send({ error: "Configuração desconhecida." });
    return { key, value: await getSetting(key) };
  });

  app.put("/settings/:key", { preHandler: requireRole("admin") }, async (req, reply) => {
    const { key } = req.params as { key: string };
    if (!isSettingKey(key)) return reply.code(400).send({ error: "Configuração desconhecida." });
    const parsed = SETTINGS[key].schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: parsed.error.flatten() });
    }
    await saveSetting(key, parsed.data, (req.user as JwtUser).sub);
    await logAudit(req, {
      action: "settings.update",
      entity: "settings",
      entityId: key,
      description: `Alterou a configuração "${key}"`,
    });
    return { key, value: await getSetting(key) };
  });
}
