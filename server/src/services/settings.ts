import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { appSettings } from "../db/schema/index";
import { DEFAULT_OS_MESSAGES, type OsMessagesSettings } from "./osMessages";

// Armazenamento genérico de configurações (chave -> JSON).
// Para adicionar uma configuração nova, basta registrar uma entrada em SETTINGS
// (schema zod + valores padrão). Chaves fora daqui são recusadas (400).
interface SettingDef<T> {
  schema: z.ZodType<T>;
  defaults: T;
}

const template = z.string().trim().min(1, "Modelo vazio").max(1000);
const flag = z.boolean();

const osMessagesSchema = z
  .object({
    templates: z
      .object({
        aguardando_aprovacao: template,
        pronto_retirada: template,
        entregue: template,
      })
      .strict(),
    enabled: z.object({ aguardando_aprovacao: flag, pronto_retirada: flag, entregue: flag }).strict(),
    includePixKey: z.boolean(),
    pixKey: z.string().trim().max(200),
    storeName: z.string().trim().min(1).max(80),
  })
  .strict();

export const SETTINGS = {
  os_messages: {
    schema: osMessagesSchema,
    defaults: DEFAULT_OS_MESSAGES,
  } satisfies SettingDef<OsMessagesSettings>,
} as const;

export type SettingKey = keyof typeof SETTINGS;

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, key);
}

// Mescla o que está salvo com os padrões (campos novos ganham padrão sem migração)
function mergeDeep(base: unknown, over: unknown): unknown {
  if (over === undefined || over === null) return base;
  if (typeof base === "object" && base !== null && !Array.isArray(base) && typeof over === "object" && !Array.isArray(over)) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
      out[k] = k in out ? mergeDeep(out[k], v) : v;
    }
    return out;
  }
  return over;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<z.infer<(typeof SETTINGS)[K]["schema"]>> {
  const def = SETTINGS[key];
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  const merged = mergeDeep(def.defaults, row?.value);
  const parsed = def.schema.safeParse(merged);
  return (parsed.success ? parsed.data : def.defaults) as z.infer<(typeof SETTINGS)[K]["schema"]>;
}

export async function saveSetting(key: SettingKey, value: unknown, userId: string | null) {
  await db
    .insert(appSettings)
    .values({ key, value: value as never, updatedBy: userId })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: value as never, updatedAt: new Date(), updatedBy: userId },
    });
}
