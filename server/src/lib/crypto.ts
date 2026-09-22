import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Cifra simétrica AES-256-GCM para valores secretos em repouso (variáveis customizadas).
// Arquivo puro (recebe o segredo por parâmetro) para poder ser testado sem o ambiente do servidor.
// Formato: "v1:<iv b64>:<tag b64>:<cifrado b64>". O IV é aleatório a cada cifragem.

export function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(`pp-secrets-v1:${secret}`).digest();
}

export function encryptWith(secret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

// Lança erro se o formato for inválido ou se a chave estiver errada / o dado foi adulterado
export function decryptWith(secret: string, payload: string): string {
  const [v, ivB, tagB, encB] = payload.split(":");
  if (v !== "v1" || !ivB || !tagB || encB === undefined) throw new Error("Formato cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}
