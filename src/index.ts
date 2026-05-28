import { config } from './config';
import { logger } from './logger';
import { buildServer } from './api/server';
import { runMigrations } from './db/migrate';
import { startScheduler, stopScheduler, runScheduledIngestion } from './jobs/scheduler';
import { closePool } from './db/pool';

async function main(): Promise<void> {
  // Apply pending migrations on boot so a fresh deploy is self-provisioning.
  const { applied } = await runMigrations();
  if (applied.length) logger.info('migrations applied on boot', { applied });

  const app = buildServer();
  await app.listen({ port: config.server.port, host: config.server.host });
  logger.info('api listening', { port: config.server.port, host: config.server.host });

  startScheduler();

  if (config.ingestion.runOnStart) {
    logger.info('running ingestion on start');
    void runScheduledIngestion();
  }

  const shutdown = async (signal: string) => {
    logger.info('shutting down', { signal });
    stopScheduler();
    try {
      await app.close();
      await closePool();
    } catch (err) {
      logger.error('error during shutdown', { error: (err as Error).message });
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('fatal startup error', { error: (err as Error).message });
  process.exit(1);
});
