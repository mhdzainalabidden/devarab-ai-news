import { fileURLToPath } from 'node:url';
import { runIngestion } from '../ingestion/orchestrator';
import { closePool } from '../db/pool';
import { logger } from '../logger';

// One-shot ingestion runner for cron/CI/manual use:
//   npm run ingest             # only sources due for checking
//   npm run ingest -- --force  # check every active source regardless of interval
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const force = process.argv.includes('--force');
  runIngestion({ force })
    .then((result) => {
      logger.info('ingest-once finished', {
        sourcesChecked: result.sourcesChecked,
        itemsInserted: result.itemsInserted,
        itemsSkipped: result.itemsSkipped,
        errors: result.errors,
      });
    })
    .catch((err) => {
      logger.error('ingest-once failed', { error: (err as Error).message });
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
