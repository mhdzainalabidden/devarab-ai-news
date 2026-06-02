import { fileURLToPath } from 'node:url';
import { query, withTransaction, closePool } from '../db/pool';
import { startJobRun, finishJobRun } from '../repositories/jobRuns.repo';
import { logger } from '../logger';

/**
 * Promote items that ARE fully enriched and verified but were parked in
 * `needs_review` by a stricter confidence threshold than the current one.
 * Free (no LLM calls), idempotent, dry-run by default.
 *
 *   npm run promote:enriched            # DRY RUN: count what would promote
 *   npm run promote:enriched -- --yes   # apply the promotion
 *
 * Criteria for promotion (all must hold):
 *   status   = 'needs_review'
 *   verified = TRUE  (already cleared domain verification)
 *   title_ar   IS NOT NULL AND <> ''
 *   summary_ar IS NOT NULL AND <> ''
 *
 * Guards:
 *   - PROMOTE_MAX_PER_RUN safety cap (default 5000) aborts a too-large sweep.
 *   - The UPDATE runs inside a single transaction.
 *   - Apply runs are recorded in job_runs with before/after counts.
 */

function intEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

const SELECT_WHERE = `
  status = 'needs_review'
  AND verified = TRUE
  AND title_ar   IS NOT NULL AND title_ar   <> ''
  AND summary_ar IS NOT NULL AND summary_ar <> ''
`;

async function countCandidates(): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM news_items WHERE ${SELECT_WHERE}`,
  );
  return Number(rows[0]?.n ?? 0);
}

async function countPublished(): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM news_items WHERE status = 'published'`,
  );
  return Number(rows[0]?.n ?? 0);
}

async function applyPromotion(): Promise<number> {
  return withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE news_items
          SET status = 'published', updated_at = now()
        WHERE ${SELECT_WHERE}`,
    );
    return res.rowCount ?? 0;
  });
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--yes');
  const maxPerRun = intEnv('PROMOTE_MAX_PER_RUN', 5000);

  const [candidates, publishedBefore] = await Promise.all([countCandidates(), countPublished()]);
  logger.info('promote:enriched starting', {
    mode: apply ? 'apply' : 'dry-run',
    candidates,
    publishedBefore,
    maxPerRun,
  });

  if (!apply) {
    logger.info('promote:enriched dry-run complete — re-run with --yes to apply', {
      wouldPromote: candidates,
    });
    return;
  }

  if (candidates === 0) {
    logger.info('promote:enriched: nothing to do');
    return;
  }

  if (candidates > maxPerRun) {
    const err = new Error(
      `promote aborted: ${candidates} candidates exceeds safety cap PROMOTE_MAX_PER_RUN=${maxPerRun}. ` +
        `Raise PROMOTE_MAX_PER_RUN if this is intentional.`,
    );
    logger.error('promote:enriched aborted by safety cap', { candidates, cap: maxPerRun });
    throw err;
  }

  const jobId = await startJobRun('promote_enriched');
  try {
    const promoted = await applyPromotion();
    const publishedAfter = await countPublished();
    await finishJobRun(jobId, {
      status: 'success',
      items_inserted: promoted,
      detail: {
        kind: 'promote_enriched',
        candidates,
        promoted,
        publishedBefore,
        publishedAfter,
        safetyCap: maxPerRun,
      },
    });
    logger.info('promote:enriched done', { promoted, publishedAfter });
  } catch (err) {
    await finishJobRun(jobId, {
      status: 'failed',
      errors: 1,
      detail: { kind: 'promote_enriched', error: (err as Error).message },
    });
    throw err;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main()
    .catch((err) => {
      logger.error('promote:enriched failed', { error: (err as Error).message });
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
