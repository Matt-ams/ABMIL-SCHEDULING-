import { Pool, type PoolClient, type QueryResultRow } from 'pg';

// One pool per serverless instance; keep size deliberately small for a pooled DB endpoint.
const globals = globalThis as typeof globalThis & { __abmilPool?: Pool };
export function isConfigured() {
  return !!process.env.DATABASE_URL && !!process.env.APP_SESSION_SECRET && process.env.APP_SESSION_SECRET.length >= 32;
}
/** Node hosting already scopes the shared pool to a serverless instance. */
export function withDatabase<Handler extends (...args: any[]) => Promise<any>>(handler: Handler): Handler { return handler; }
export function database(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!globals.__abmilPool) {
    globals.__abmilPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 12000,
      application_name: 'abmil-pose-workforce'
    });
  }
  return globals.__abmilPool;
}
export async function transaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const output = await fn(client);
    await client.query('COMMIT');
    return output;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function one<T extends QueryResultRow>(db: PoolClient | Pool, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const { rows } = await db.query<T>(sql, params);
  return rows[0];
}
export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
