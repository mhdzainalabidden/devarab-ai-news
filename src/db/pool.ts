import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: config.database.url,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => {
    logger.error('postgres pool error', { error: err.message });
  });
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const p = getPool();
  const res = await p.query<T>(text, params as never[]);
  return { rows: res.rows, rowCount: res.rowCount ?? 0 };
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
