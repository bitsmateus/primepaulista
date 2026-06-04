import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET deve ter ao menos 16 caracteres"),
  PORT: z.coerce.number().default(3333),
  // Origens permitidas para CORS (separadas por vírgula). Vazio = libera todas (dev).
  CORS_ORIGIN: z.string().optional().default(""),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
