import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { profiles } from "./schema/index";
import { hashPassword } from "../auth/password";

// Cria (ou atualiza) o usuário admin inicial.
// Uso: npx tsx src/db/seed-admin.ts "Nome" "email@x.com" "senha"
// Ou via ambiente: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
async function main() {
  const [, , nameArg, emailArg, passwordArg] = process.argv;
  const name = nameArg ?? process.env.ADMIN_NAME ?? "Admin";
  const email = (emailArg ?? process.env.ADMIN_EMAIL ?? "").toLowerCase();
  const password = passwordArg ?? process.env.ADMIN_PASSWORD ?? "";

  if (!email || !password) {
    console.error(
      "❌ Informe e-mail e senha. Uso: npx tsx src/db/seed-admin.ts \"Nome\" \"email\" \"senha\""
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(profiles)
      .set({ name, passwordHash, role: "admin", active: true })
      .where(eq(profiles.id, existing.id));
    console.log(`✅ Admin atualizado: ${email}`);
  } else {
    await db.insert(profiles).values({
      name,
      email,
      passwordHash,
      role: "admin",
      active: true,
    });
    console.log(`✅ Admin criado: ${email}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro ao criar admin:", err);
  process.exit(1);
});
