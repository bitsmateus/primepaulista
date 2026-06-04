import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL não definido em server/.env");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query("select version(), current_database(), now()");
    console.log("✅ Conexão OK!");
    console.log("   Banco :", res.rows[0].current_database);
    console.log("   Versão:", res.rows[0].version.split(",")[0]);
    console.log("   Hora  :", res.rows[0].now);
  } catch (err) {
    console.error("❌ Falha ao conectar:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
