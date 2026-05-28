import cron, { type ScheduledTask } from 'node-cron';
import { config } from '../config';
import { logger } from '../logger';
import { runIngestion } from '../ingestion/orchestrator';
import { withIngestionLock, IngestionBusyError } from '../ingestion/runLock';

let task: ScheduledTask | null = null;

export async function runScheduledIngestion(): Promise<void> {
  try {
    await withIngestionLock(() => runIngestion({}));
  } catch (err) {
    if (err instanceof IngestionBusyError) {
      logger.warn('scheduled ingestion skipped: a run is already in progress');
      return;
    }
    logger.error('scheduled ingestion failed', { error: (err as Error).message });
  }
}

/** Start the in-process hourly scheduler. Returns false if disabled or invalid cron. */
export function startScheduler(): boolean {
  if (!config.ingestion.schedulerEnabled) {
    logger.info('scheduler disabled (SCHEDULER_ENABLED=false)');
    return false;
  }
  if (!cron.validate(config.ingestion.cron)) {
    logger.error('invalid INGESTION_CRON; scheduler not started', { cron: config.ingestion.cron });
    return false;
  }
  task = cron.schedule(config.ingestion.cron, () => {
    logger.info('scheduled ingestion tick', { cron: config.ingestion.cron });
    void runScheduledIngestion();
  });
  logger.info('scheduler started', { cron: config.ingestion.cron });
  return true;
}

export function stopScheduler(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
