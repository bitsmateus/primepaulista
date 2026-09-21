import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index";
import { appSettings } from "../db/schema/index";
import { DEFAULT_OS_MESSAGES, type OsMessagesSettings } from "./osMessages";
import {
  DEFAULT_SECURITY, DEFAULT_STORE, DEFAULT_WARRANTY_TERMS,
  type SecuritySettings, type StoreSettings, type WarrantyTerms,
} from "../lib/settingsDefaults";

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
    storeName: z.string().trim().max(80),
  })
  .strict();

const optText = (max: number) => z.string().trim().max(max);

const storeSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome da loja").max(80),
    slogan: optText(120),
    whatsapp: optText(40),
    facebook: optText(80),
    instagram: optText(80),
    email: optText(120),
    address: optText(200),
    cnpj: optText(30),
    pixKey: optText(200),
  })
  .strict();

// Logo: "" = logo padrão; senão data URL de imagem (o navegador já reduz para <= 512 px)
const logoSchema = z
  .object({
    dataUrl: z
      .string()
      .max(900_000, "Imagem muito grande")
      .refine((v) => v === "" || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), "Formato de imagem inválido"),
  })
  .strict();

const termText = (max: number) => z.string().max(max);
const warrantyTermsSchema = z
  .object({
    days: z
      .object({
        lacrado: z.number().int().min(0).max(3650),
        seminovo: z.number().int().min(0).max(3650),
        bateria: z.number().int().min(0).max(3650),
        servico: z.number().int().min(0).max(3650),
      })
      .strict(),
    footer: termText(400),
    title: termText(120),
    lead: termText(800),
    bullets: z.array(termText(800)).max(20),
    sections: z.array(z.object({ title: termText(300), text: termText(2000) }).strict()).max(8),
    agree: termText(200),
    signLabel: termText(120),
  })
  .strict();

const securitySchema = z.object({ autoLockMinutes: z.number().int().min(0).max(1440) }).strict();

export const SETTINGS = {
  os_messages: {
    schema: osMessagesSchema,
    defaults: DEFAULT_OS_MESSAGES,
  } satisfies SettingDef<OsMessagesSettings>,
  store: { schema: storeSchema, defaults: DEFAULT_STORE } satisfies SettingDef<StoreSettings>,
  logo: { schema: logoSchema, defaults: { dataUrl: "" } } satisfies SettingDef<{ dataUrl: string }>,
  warranty_terms: { schema: warrantyTermsSchema, defaults: DEFAULT_WARRANTY_TERMS } satisfies SettingDef<WarrantyTerms>,
  security: { schema: securitySchema, defaults: DEFAULT_SECURITY } satisfies SettingDef<SecuritySettings>,
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
