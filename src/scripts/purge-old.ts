import { fileURLToPath } from 'node:url';
import { query, closePool } from '../db/pool';
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
 * Override windows via env (days):
 *   RETENTION_IGNORED_DAYS  default 14   — applies to ignored + duplicate
 *   RETENTION_LOW_DAYS      default 60   — impact_level='low'
 *   RETENTION_MEDIUM_DAYS   default 180  — impact_level='medium'
 *   RETENTION_HIGH_DAYS     default 365  — impact_level='high'
 *   (impact_level='critical' is kept indefinitely)
 */

interface Tier {
  name: string;
  days: number;
  where: string;
}

function intEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (!raw) return def;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

function buildTiers(): Tier[] {
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

const AGE_EXPR = `coalesce(published_at, detected_at)`;

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
  const { rowCount } = await query(
    `DELETE FROM news_items
      WHERE ${t.where}
        AND ${AGE_EXPR} < now() - ($1 || ' days')::interval`,
    [String(t.days)],
  );
  return rowCount;
}

async function totalRows(): Promise<number> {
  const { rows } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM news_items`);
  return Number(rows[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--yes');
  const tiers = buildTiers();
  const before = await totalRows();

  logger.info('purge:items starting', {
    mode: apply ? 'apply' : 'dry-run',
    totalRowsBefore: before,
    tiers: tiers.map((t) => ({ name: t.name, days: t.days })),
  });

  let grandTotal = 0;
  for (const t of tiers) {
    if (apply) {
      const deleted = await deleteTier(t);
      grandTotal += deleted;
      logger.info('purge:items tier applied', { tier: t.name, days: t.days, deleted });
    } else {
      const matched = await countTier(t);
      grandTotal += matched;
      logger.info('purge:items tier dry-run', { tier: t.name, days: t.days, wouldDelete: matched });
    }
  }

  if (apply) {
    const after = await totalRows();
    logger.info('purge:items done', { deletedTotal: grandTotal, totalRowsAfter: after });
  } else {
    logger.info('purge:items dry-run complete — re-run with --yes to apply', {
      wouldDeleteTotal: grandTotal,
      keepCritical: true,
    });
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
