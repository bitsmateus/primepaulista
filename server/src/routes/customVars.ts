import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { customVariables } from "../db/schema/index";
import { authenticate, requireCapability, type JwtUser } from "../plugins/auth";
import { logAudit } from "../services/audit";
import { VAR_NAME, decryptSecret, encryptSecret } from "../services/secrets";

const MASK = "••••••••";

// Variáveis customizadas (capacidade manageSecrets = admin).
// O valor NUNCA aparece na listagem nem em GET /settings; só o endpoint "reveal" devolve o valor (auditado).
export async function customVarRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireCapability("manageSecrets"));

  app.get("/custom-vars", async () => {
    const rows = await db.select().from(customVariables).orderBy(customVariables.name);
    return {
      variables: rows.map((r) => ({ name: r.name, masked: MASK, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    };
  });

  // PUT /custom-vars/:name — cria ou substitui o valor
  app.put("/custom-vars/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!VAR_NAME.test(name)) {
      return reply.code(400).send({ error: "Nome inválido. Use MAIÚSCULAS, números e _ (ex.: GEMINI_API_KEY)." });
    }
    const p = z.object({ value: z.string().min(1, "Informe o valor").max(4000) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? "Dados inválidos" });
    const userId = (req.user as JwtUser).sub;
    const [existing] = await db.select({ id: customVariables.id }).from(customVariables).where(eq(customVariables.name, name)).limit(1);
    const valueEnc = encryptSecret(p.data.value);
    if (existing) {
      await db.update(customVariables).set({ valueEnc, updatedAt: new Date() }).where(eq(customVariables.id, existing.id));
    } else {
      await db.insert(customVariables).values({ name, valueEnc, createdBy: userId });
    }
    // O valor não entra na auditoria
    await logAudit(req, {
      action: existing ? "custom_var.update" : "custom_var.create",
      entity: "custom_var",
      entityId: name,
      description: `${existing ? "Alterou o valor da" : "Criou a"} variável ${name}`,
    });
    return reply.code(existing ? 200 : 201).send({ ok: true, name, masked: MASK });
  });

  app.delete("/custom-vars/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    const rows = await db.delete(customVariables).where(eq(customVariables.name, name)).returning({ id: customVariables.id });
    if (rows.length === 0) return reply.code(404).send({ error: "Variável não encontrada" });
    await logAudit(req, {
      action: "custom_var.delete",
      entity: "custom_var",
      entityId: name,
      description: `Excluiu a variável ${name}`,
    });
    return { ok: true };
  });

  // POST /custom-vars/:name/reveal — devolve o valor (cada consulta fica na auditoria)
  app.post(
    "/custom-vars/:name/reveal",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { name } = req.params as { name: string };
      const [row] = await db.select().from(customVariables).where(eq(customVariables.name, name)).limit(1);
      if (!row) return reply.code(404).send({ error: "Variável não encontrada" });
      let value: string;
      try {
        value = decryptSecret(row.valueEnc);
      } catch {
        return reply.code(409).send({ error: "Não foi possível decifrar o valor (a chave de cifra mudou). Cadastre o valor de novo." });
      }
      await logAudit(req, {
        action: "custom_var.reveal",
        entity: "custom_var",
        entityId: name,
        description: `Consultou o valor da variável ${name}`,
      });
      reply.header("Cache-Control", "no-store");
      return { name, value };
    }
  );
}
