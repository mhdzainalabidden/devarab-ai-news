import { fileURLToPath } from 'node:url';
import { upsertSource } from '../repositories/sources.repo';
import { SEED_SOURCES } from './seeds/sources.seed';
import { runMigrations } from './migrate';
import { closePool } from './pool';
import { logger } from '../logger';

export async function seedSources(): Promise<{ count: number }> {
  let count = 0;
  for (const src of SEED_SOURCES) {
    await upsertSource(src);
    count += 1;
  }
  return { count };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  (async () => {
    await runMigrations(); // ensure schema exists before seeding
    const { count } = await seedSources();
    logger.info('seeded sources', { count });
  })()
    .catch((err) => {
      logger.error('seed failed', { error: (err as Error).message });
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
