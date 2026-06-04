import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`
    );
    console.log(`✅ ${res.rows.length} tabelas no banco:`);
    res.rows.forEach((r) => console.log("   -", r.table_name));
  } finally {
    await pool.end();
  }
}

main();
