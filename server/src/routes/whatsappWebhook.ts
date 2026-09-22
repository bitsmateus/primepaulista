import type { FastifyInstance } from "fastify";
import { findInstanceBySecret } from "../services/whatsapp";
import { handleInboundPayload } from "../services/inboundWhatsapp";

// Webhook PÚBLICO de entrada de mensagens do WhatsApp (Uazapi): POST /whatsapp/webhook/:secret
//
// Segurança e robustez (rota sem login, chamada por um servidor externo):
//  - o segredo da URL é aleatório por número e comparado em tempo constante; inválido = 404;
//  - corpo limitado a 256 KB (413 acima disso); JSON quebrado, tipo de conteúdo estranho ou campos com
//    tipo errado NUNCA geram erro: respondemos 200 e ignoramos (o provedor não fica reenviando);
//  - qualquer falha interna vira log no servidor + resposta 200 sem detalhes (nunca 500 ao provedor);
//  - a resposta não vaza nada: só quantas mensagens foram lidas e um código curto por mensagem;
//  - limite de requisições próprio (600/min por IP), acima do limite geral da API.
const BODY_LIMIT = 256 * 1024;

export async function whatsappWebhookRoutes(app: FastifyInstance) {
  // Corpo tolerante: nunca lança no parser (JSON inválido vira null)
  const lenient = (_req: unknown, body: string | Buffer, done: (err: Error | null, value?: unknown) => void) => {
    const text = typeof body === "string" ? body : body.toString("utf8");
    if (!text.trim()) return done(null, null);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(null, null);
    }
  };
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: BODY_LIMIT }, lenient);
  app.addContentTypeParser("*", { parseAs: "string", bodyLimit: BODY_LIMIT }, lenient);

  // Erros do próprio Fastify (corpo grande demais, limite de requisições...) mantêm o código;
  // qualquer outro vira 200 sem detalhes.
  app.setErrorHandler((err, req, reply) => {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 413 || status === 429) {
      return reply.code(status).send({ ok: false });
    }
    req.log.error({ err }, "webhook do WhatsApp: erro tratado");
    return reply.code(200).send({ ok: true, received: 0, results: [] });
  });

  app.post(
    "/whatsapp/webhook/:secret",
    { bodyLimit: BODY_LIMIT, config: { rateLimit: { max: 600, timeWindow: "1 minute" } } },
    async (req, reply) => {
      try {
        const { secret } = req.params as { secret: string };
        const inst = typeof secret === "string" && secret.length >= 16 && secret.length <= 200 ? await findInstanceBySecret(secret) : null;
        if (!inst) return reply.code(404).send({ error: "Não encontrado" });
        const out = await handleInboundPayload(inst, req.body);
        return reply.code(200).send({ ok: true, received: out.received, results: out.results });
      } catch (err) {
        req.log.error({ err }, "webhook do WhatsApp: falha interna");
        return reply.code(200).send({ ok: true, received: 0, results: [] });
      }
    }
  );
}
