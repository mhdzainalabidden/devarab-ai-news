import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, closePool } from './pool';
import { logger } from '../logger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await getPool().query<{ filename: string }>(
    'SELECT filename FROM schema_migrations',
  );
  return new Set(rows.map((r) => r.filename));
}

export async function runMigrations(): Promise<{ applied: string[] }> {
  await ensureMigrationsTable();
  const done = await appliedMigrations();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    logger.info('applying migration', { file });
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('migration failed', { file, error: (err as Error).message });
      throw err;
    } finally {
      client.release();
    }
  }
  return { applied };
}

// Allow running directly: `npm run migrate`.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runMigrations()
    .then(({ applied }) => {
      if (applied.length === 0) logger.info('migrations up to date');
      else logger.info('migrations applied', { applied });
    })
    .catch((err) => {
      logger.error('migration run failed', { error: (err as Error).message });
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
