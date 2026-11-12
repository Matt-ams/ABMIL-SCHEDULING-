import { readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL absent. Configurez une base PostgreSQL privée.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
try {
  const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  const result = await pool.query("SELECT COUNT(*)::int AS tables FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('employees','sites','work_sessions','work_breaks','punch_events')");
  if (result.rows[0].tables !== 5) throw new Error('Schéma incomplet');
  console.log('Migration terminée : tables de pointage disponibles.');
} catch (error) {
  console.error('Migration impossible :', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
