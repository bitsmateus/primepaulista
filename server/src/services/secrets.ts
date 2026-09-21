import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { customVariables } from "../db/schema/index";
import { env } from "../env";
import { decryptWith, encryptWith } from "../lib/crypto";

// Chave de cifra das variáveis customizadas: SETTINGS_ENC_KEY (recomendado) ou, na falta,
// derivada do JWT_SECRET. Trade-off: se a chave mudar, os valores já gravados deixam de
// poder ser lidos (é preciso cadastrá-los de novo).
const secret = () => env.SETTINGS_ENC_KEY || env.JWT_SECRET;

export const encryptSecret = (plain: string) => encryptWith(secret(), plain);
export const decryptSecret = (payload: string) => decryptWith(secret(), payload);

export const VAR_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;

// Lê uma variável customizada já decifrada (uso interno do servidor, ex.: chave do Gemini).
// Devolve null se não existir ou não puder ser decifrada. NUNCA repasse o valor a rotas de listagem.
export async function getCustomVar(name: string): Promise<string | null> {
  const [row] = await db.select().from(customVariables).where(eq(customVariables.name, name)).limit(1);
  if (!row) return null;
  try {
    return decryptSecret(row.valueEnc);
  } catch {
    return null;
  }
}
