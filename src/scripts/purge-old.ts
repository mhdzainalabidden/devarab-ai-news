import { fileURLToPath } from 'node:url';
import { query, withTransaction, closePool } from '../db/pool';
import { startJobRun, finishJobRun } from '../repositories/jobRuns.repo';
import { logger } from '../logger';

/**
 * Tiered retention purge for news_items, sized so the project stays
 * comfortably under Supabase's 500 MB free-tier ceiling forever.
 *
 *   npm run purge:items            # DRY RUN: per-tier counts + total
 *   npm run purge:items -- --yes   # actually delete the matched rows
 *
 * Tiers are based on impact_level and status. `critical` is never deleted.
 * Junk states (`ignored`, `duplicate`) are pruned aggressively because they
 * carry no archival value. Age uses coalesce(published_at, detected_at) so
 * rows without a publish date still get aged out by when we first saw them.
 *
 * Production guards:
 *   - Each tier DELETE runs in its own transaction (atomic per tier).
 *   - PURGE_MAX_PER_RUN (default 5000) aborts the apply if the dry-run total
 *     exceeds it, preventing a misconfigured window from wiping the table.
 *   - Apply runs are recorded in job_runs with per-tier counts for audit.
 *
 * Override windows via env (days):
 *   RETENTION_IGNORED_DAYS  default 14   — applies to ignored + duplicate
 *   RETENTION_LOW_DAYS      default 60   — impact_level='low'
 *   RETENTION_MEDIUM_DAYS   default 180  — impact_level='medium'
 *   RETENTION_HIGH_DAYS     default 365  — impact_level='high'
 *   (impact_level='critical' is kept indefinitely)
 *   PURGE_MAX_PER_RUN       default 5000 — hard safety cap on apply
 */

export interface Tier {
  name: string;
  days: number;
  where: string;
}

export function intEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

export function buildTiers(): Tier[] {
  return [
    {
      name: 'ignored/duplicate',
      days: intEnv('RETENTION_IGNORED_DAYS', 14),
      where: `status IN ('ignored','duplicate')`,
    },
    {
      name: 'low impact',
      days: intEnv('RETENTION_LOW_DAYS', 60),
      where: `impact_level = 'low' AND status NOT IN ('ignored','duplicate')`,
    },
    {
      name: 'medium impact',
      days: intEnv('RETENTION_MEDIUM_DAYS', 180),
      where: `impact_level = 'medium' AND status NOT IN ('ignored','duplicate')`,
    },
    {
      name: 'high impact',
      days: intEnv('RETENTION_HIGH_DAYS', 365),
      where: `impact_level = 'high' AND status NOT IN ('ignored','duplicate')`,
    },
  ];
}

export const AGE_EXPR = `coalesce(published_at, detected_at)`;

async function countTier(t: Tier): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM news_items
      WHERE ${t.where}
        AND ${AGE_EXPR} < now() - ($1 || ' days')::interval`,
    [String(t.days)],
  );
  return Number(rows[0]?.n ?? 0);
}

async function deleteTier(t: Tier): Promise<number> {
  // Each tier runs in its own transaction so a partial failure in one tier
  // doesn't half-finish the others.
  return withTransaction(async (client) => {
    const res = await client.query(
      `DELETE FROM news_items
        WHERE ${t.where}
          AND ${AGE_EXPR} < now() - ($1 || ' days')::interval`,
      [String(t.days)],
    );
    return res.rowCount ?? 0;
  });
}

async function totalRows(): Promise<number> {
  const { rows } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM news_items`);
  return Number(rows[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--yes');
  const tiers = buildTiers();
  const maxPerRun = intEnv('PURGE_MAX_PER_RUN', 5000);
  const before = await totalRows();

  logger.info('purge:items starting', {
    mode: apply ? 'apply' : 'dry-run',
    totalRowsBefore: before,
    maxPerRun,
    tiers: tiers.map((t) => ({ name: t.name, days: t.days })),
  });

  // Always do a dry-run pass first. Cheap (COUNTs only), gives us the audit
  // breakdown in logs, and feeds the safety cap before any DELETE runs.
  const previews: Array<{ tier: Tier; matched: number }> = [];
  let plannedTotal = 0;
  for (const t of tiers) {
    const matched = await countTier(t);
    previews.push({ tier: t, matched });
    plannedTotal += matched;
    logger.info('purge:items tier preview', { tier: t.name, days: t.days, wouldDelete: matched });
  }

  if (!apply) {
    logger.info('purge:items dry-run complete — re-run with --yes to apply', {
      wouldDeleteTotal: plannedTotal,
      keepCritical: true,
    });
    return;
  }

  if (plannedTotal > maxPerRun) {
    // Hard safety cap: abort rather than wipe a huge slice of the table due
    // to a misconfigured window or a long backlog of new data. Operator can
    // raise PURGE_MAX_PER_RUN explicitly if they really want a big sweep.
    const err = new Error(
      `purge aborted: planned ${plannedTotal} rows exceeds safety cap PURGE_MAX_PER_RUN=${maxPerRun}. ` +
        `Raise PURGE_MAX_PER_RUN if this is intentional.`,
    );
    logger.error('purge:items aborted by safety cap', {
      planned: plannedTotal,
      cap: maxPerRun,
      perTier: previews.map((p) => ({ tier: p.tier.name, matched: p.matched })),
    });
    throw err;
  }

  const jobId = await startJobRun('purge_items');
  const perTier: Record<string, number> = {};
  let deletedTotal = 0;
  let errors = 0;
  try {
    for (const { tier } of previews) {
      try {
        const deleted = await deleteTier(tier);
        perTier[tier.name] = deleted;
        deletedTotal += deleted;
        logger.info('purge:items tier applied', { tier: tier.name, days: tier.days, deleted });
      } catch (err) {
        errors += 1;
        perTier[tier.name] = -1;
        logger.error('purge:items tier failed', {
          tier: tier.name,
          error: (err as Error).message,
        });
      }
    }

    const after = await totalRows();
    await finishJobRun(jobId, {
      status: errors === 0 ? 'success' : 'partial',
      items_inserted: 0,
      items_skipped: 0,
      errors,
      detail: {
        kind: 'retention_purge',
        perTier,
        deletedTotal,
        totalRowsBefore: before,
        totalRowsAfter: after,
        windows: Object.fromEntries(tiers.map((t) => [t.name, t.days])),
        safetyCap: maxPerRun,
      },
    });
    logger.info('purge:items done', { deletedTotal, totalRowsAfter: after, errors });
  } catch (err) {
    await finishJobRun(jobId, {
      status: 'failed',
      errors: errors + 1,
      detail: { kind: 'retention_purge', perTier, error: (err as Error).message },
    });
    throw err;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main()
    .catch((err) => {
      logger.error('purge:items failed', { error: (err as Error).message });
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
