import { AsyncLocalStorage } from 'node:async_hooks';
import { Client, type QueryResultRow } from 'pg';
// @ts-ignore Resolved only in the Cloudflare Worker build.
import { env } from 'cloudflare:workers';

const requestDatabase = new AsyncLocalStorage<Client>();

export function isConfigured() {
  return Boolean(env.HYPERDRIVE?.connectionString) && Boolean(process.env.APP_SESSION_SECRET && process.env.APP_SESSION_SECRET.length >= 32);
}

export function database(): Client {
  const client = requestDatabase.getStore();
  if (!client) throw new Error('DATABASE_CONTEXT_MISSING');
  return client;
}

export async function transaction<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = database();
  await db.query('BEGIN');
  try {
    const output = await fn(db);
    await db.query('COMMIT');
    return output;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export async function one<T extends QueryResultRow>(db: Client, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const { rows } = await db.query<T>(sql, params);
  return rows[0];
}

export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** One PostgreSQL client per Worker request; Hyperdrive pools the actual DB connections. */
export function withDatabase<Handler extends (...args: any[]) => Promise<any>>(handler: Handler): Handler {
  return (async (...args: Parameters<Handler>) => {
    const hyperdrive = env.HYPERDRIVE;
    if (!hyperdrive || !isConfigured()) return handler(...args);
    const client = new Client({
      connectionString: hyperdrive.connectionString,
      connectionTimeoutMillis: 10000,
      statement_timeout: 12000,
      application_name: 'abmil-pose-workforce',
    });
    try {
      await client.connect();
      return await requestDatabase.run(client, () => handler(...args));
    } catch (error) {
      console.error('ABMIL database request failed', error instanceof Error ? error.message : 'unknown');
      return Response.json({ error: 'Service momentanément indisponible. Réessayez.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    } finally {
      await client.end().catch(() => {});
    }
  }) as Handler;
}
