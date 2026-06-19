import { query } from '../db/pool';
import type { Source, SourceExtra, SourceType } from '../types';

interface SourceRow {
  id: number;
  company: string;
  product: string | null;
  source_url: string;
  source_type: SourceType;
  official_domain: string;
  priority: number;
  crawl_interval_minutes: number;
  active: boolean;
  last_checked_at: Date | null;
  last_success_at: Date | null;
  failure_count: number;
  extra: SourceExtra | null;
  created_at: Date;
  updated_at: Date;
}

function map(row: SourceRow): Source {
  return { ...row };
}

/** Active sources whose crawl interval has elapsed since last_checked_at (or never checked). */
export async function findDueSources(now: Date = new Date()): Promise<Source[]> {
  const { rows } = await query<SourceRow>(
    `
    SELECT * FROM sources
    WHERE active = TRUE
      AND (
        last_checked_at IS NULL
        OR last_checked_at <= $1::timestamptz - (crawl_interval_minutes || ' minutes')::interval
      )
    ORDER BY priority ASC, last_checked_at ASC NULLS FIRST
    `,
    [now.toISOString()],
  );
  return rows.map(map);
}

export async function listSources(): Promise<Source[]> {
  const { rows } = await query<SourceRow>(
    `SELECT * FROM sources ORDER BY company ASC, product ASC NULLS FIRST, id ASC`,
  );
  return rows.map(map);
}

export async function getSourceById(id: number): Promise<Source | null> {
  const { rows } = await query<SourceRow>(`SELECT * FROM sources WHERE id = $1`, [id]);
  return rows[0] ? map(rows[0]) : null;
}

export interface UpsertSourceInput {
  company: string;
  product?: string | null;
  source_url: string;
  source_type: SourceType;
  official_domain: string;
  priority?: number;
  crawl_interval_minutes?: number;
  active?: boolean;
  extra?: SourceExtra | null;
}

export interface UpsertSourceOptions {
  /**
   * When true, an existing row's `active` flag is preserved on conflict (only
   * brand-new rows take the input's `active`). Catalog seeding uses this so that
   * re-running `seed:catalog` (whose rows are all active:false) never silently
   * deactivates sources the operator has turned on. Defaults to false, which
   * keeps the prior behavior of writing EXCLUDED.active.
   */
  preserveActiveOnConflict?: boolean;
}

/** Insert a source, or update it if a row with the same source_url already exists. */
export async function upsertSource(
  input: UpsertSourceInput,
  opts: UpsertSourceOptions = {},
): Promise<Source> {
  const activeAssign = opts.preserveActiveOnConflict
    ? 'active = sources.active'
    : 'active = EXCLUDED.active';
  const { rows } = await query<SourceRow>(
    `
    INSERT INTO sources
      (company, product, source_url, source_type, official_domain, priority, crawl_interval_minutes, active, extra)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (source_url) DO UPDATE SET
      company = EXCLUDED.company,
      product = EXCLUDED.product,
      source_type = EXCLUDED.source_type,
      official_domain = EXCLUDED.official_domain,
      priority = EXCLUDED.priority,
      crawl_interval_minutes = EXCLUDED.crawl_interval_minutes,
      ${activeAssign},
      extra = EXCLUDED.extra,
      updated_at = now()
    RETURNING *
    `,
    [
      input.company,
      input.product ?? null,
      input.source_url,
      input.source_type,
      input.official_domain,
      input.priority ?? 100,
      input.crawl_interval_minutes ?? 60,
      input.active ?? true,
      input.extra ? JSON.stringify(input.extra) : null,
    ],
  );
  return map(rows[0]!);
}

export async function markChecked(id: number, success: boolean, now: Date = new Date()): Promise<void> {
  if (success) {
    await query(
      `UPDATE sources
         SET last_checked_at = $2, last_success_at = $2, failure_count = 0, updated_at = now()
       WHERE id = $1`,
      [id, now.toISOString()],
    );
  } else {
    await query(
      `UPDATE sources
         SET last_checked_at = $2, failure_count = failure_count + 1, updated_at = now()
       WHERE id = $1`,
      [id, now.toISOString()],
    );
  }
}

/** Companies overview: active source counts, last check, and most recent detected item. */
export interface CompanyOverview {
  company: string;
  active_sources: number;
  total_sources: number;
  products: string[];
  last_checked_at: Date | null;
  last_detected_at: Date | null;
  last_item_title: string | null;
}

export async function companiesOverview(): Promise<CompanyOverview[]> {
  const { rows } = await query<{
    company: string;
    active_sources: string;
    total_sources: string;
    products: string[];
    last_checked_at: Date | null;
    last_detected_at: Date | null;
    last_item_title: string | null;
  }>(
    `
    SELECT
      s.company,
      COUNT(*) FILTER (WHERE s.active) AS active_sources,
      COUNT(*) AS total_sources,
      COALESCE(array_agg(DISTINCT s.product) FILTER (WHERE s.product IS NOT NULL), '{}') AS products,
      MAX(s.last_checked_at) AS last_checked_at,
      n.last_detected_at,
      n.last_item_title
    FROM sources s
    LEFT JOIN LATERAL (
      SELECT detected_at AS last_detected_at, title_original AS last_item_title
      FROM news_items
      WHERE news_items.company = s.company
        AND status NOT IN ('ignored','duplicate')
      ORDER BY detected_at DESC
      LIMIT 1
    ) n ON TRUE
    GROUP BY s.company, n.last_detected_at, n.last_item_title
    ORDER BY s.company ASC
    `,
  );
  return rows.map((r) => ({
    company: r.company,
    active_sources: Number(r.active_sources),
    total_sources: Number(r.total_sources),
    products: r.products ?? [],
    last_checked_at: r.last_checked_at,
    last_detected_at: r.last_detected_at,
    last_item_title: r.last_item_title,
  }));
}
