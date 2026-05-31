import { fileURLToPath } from 'node:url';
import { upsertSource } from '../repositories/sources.repo';
import { CATALOG_SOURCES } from './seeds/sources.catalog';
import { runMigrations } from './migrate';
import { closePool } from './pool';
import { logger } from '../logger';

/**
 * Loads the EXTENDED catalog (src/db/seeds/sources.catalog.ts) into the
 * `sources` table as INACTIVE rows. Nothing is crawled until you activate it
 * (see `npm run sources:activate`). Re-runnable: upsert keys on source_url, and
 * catalog URLs don't overlap the base seed, so this never flips a base source.
 */
export async function seedCatalog(): Promise<{ count: number }> {
  let count = 0;
  for (const src of CATALOG_SOURCES) {
    await upsertSource(src);
    count += 1;
  }
  return { count };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  (async () => {
    await runMigrations(); // ensure schema exists before seeding
    const { count } = await seedCatalog();
    logger.info('seeded extended catalog (inactive)', { count });
    logger.info('next: npm run sources:activate -- "<term>"   (dry run; add --yes to apply)');
  })()
    .catch((err) => {
      logger.error('seed:catalog failed', { error: (err as Error).message });
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
