import { CATEGORIES, IMPACT_LEVELS, type Category, type ImpactLevel } from '../types';

/** Which date column date filters + ordering operate on. */
export type DateField = 'detected' | 'published';
/** Ordering direction for the feed. */
export type SortOrder = 'recent' | 'oldest';

export interface NewsListFilters {
  company?: string;
  product?: string;
  category?: Category;
  impact?: ImpactLevel;
  tag?: string;
  /**
   * Lower bound for the active date field (see `dateField`): rows where
   * `<field> >= since`. Accepts an ISO timestamp or a relative window like
   * "24h" / "7d". `from` is an alias and takes precedence when both are set.
   */
  since?: string;
  /** Explicit lower bound; alias for `since` (takes precedence). ISO or relative. */
  from?: string;
  /** Upper bound for the active date field: rows where `<field> <= to`. ISO or relative. */
  to?: string;
  /** Which date column `since`/`from`/`to` + ordering use. Defaults to 'detected'. */
  dateField?: DateField;
  /** Feed ordering on the active date field. Defaults to 'recent' (newest-first). */
  sort?: SortOrder;
  verified?: boolean;
  /** When true, only status='published' rows are returned. */
  publishedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface BuiltQuery {
  sql: string;
  values: unknown[];
}

/** Map the public `dateField` to its physical column. Whitelisted — safe to inline. */
function dateColumn(field: DateField | undefined): 'detected_at' | 'published_at' {
  return field === 'published' ? 'published_at' : 'detected_at';
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const SELECT_COLUMNS = `
  id, company, product, title_original, title_ar, title_en,
  summary_ar, summary_en, content_original, official_source_url, image_url, source_name,
  source_language, category, tags, impact_level, verified,
  published_at, detected_at, content_hash, status, source_id, created_at, updated_at
`;

/** Resolve "24h" / "7d" / "30m" or an ISO timestamp into a Date. Returns null if unparseable. */
export function resolveSince(since: string | undefined, now: Date = new Date()): Date | null {
  if (!since) return null;
  const rel = since.trim().toLowerCase().match(/^(\d+)\s*(m|h|d|w)$/);
  if (rel) {
    const n = Number(rel[1]);
    const unitMs: Record<string, number> = {
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000,
    };
    const ms = n * (unitMs[rel[2] as string] ?? 0);
    if (ms <= 0) return null;
    return new Date(now.getTime() - ms);
  }
  const d = new Date(since);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

/**
 * Build the shared WHERE clause for the news list + count queries. Pure: no DB
 * access. All user inputs are bound as parameters; `where` clauses reference
 * positional `$1..$n` matching the returned `values` order.
 */
function buildNewsWhere(
  filters: NewsListFilters,
  now: Date,
): { where: string[]; values: unknown[] } {
  const where: string[] = [];
  const values: unknown[] = [];

  const add = (clause: (idx: number) => string, value: unknown) => {
    values.push(value);
    where.push(clause(values.length));
  };

  if (filters.publishedOnly) {
    add((i) => `status = $${i}`, 'published');
  } else {
    // Never expose internal-only rows by default.
    where.push(`status NOT IN ('ignored','duplicate')`);
  }

  if (filters.company) add((i) => `lower(company) = lower($${i})`, filters.company);
  if (filters.product) add((i) => `lower(product) = lower($${i})`, filters.product);

  if (filters.category && (CATEGORIES as readonly string[]).includes(filters.category)) {
    add((i) => `category = $${i}`, filters.category);
  }
  if (filters.impact && (IMPACT_LEVELS as readonly string[]).includes(filters.impact)) {
    add((i) => `impact_level = $${i}`, filters.impact);
  }
  if (filters.tag) add((i) => `$${i} = ANY(tags)`, filters.tag);
  if (filters.verified !== undefined) add((i) => `verified = $${i}`, filters.verified);

  // Date range on the selected field. `from` aliases `since` (lower bound).
  const dateCol = dateColumn(filters.dateField);
  const fromDate = resolveSince(filters.from ?? filters.since, now);
  if (fromDate) add((i) => `${dateCol} >= $${i}`, fromDate.toISOString());
  const toDate = resolveSince(filters.to, now);
  if (toDate) add((i) => `${dateCol} <= $${i}`, toDate.toISOString());

  return { where, values };
}

/**
 * Build a parameterized SELECT for the news list endpoint. Pure: no DB access.
 * Ordered by the active date field (`dateField`, default detected_at) in the
 * requested direction (`sort`, default 'recent' = DESC). All user inputs are
 * bound as parameters.
 */
export function buildNewsListQuery(filters: NewsListFilters, now: Date = new Date()): BuiltQuery {
  const { where, values } = buildNewsWhere(filters, now);

  const limit = clampLimit(filters.limit);
  values.push(limit);
  const limitIdx = values.length;

  const offset = Math.max(0, Math.floor(filters.offset ?? 0));
  values.push(offset);
  const offsetIdx = values.length;

  const dateCol = dateColumn(filters.dateField);
  const dir = filters.sort === 'oldest' ? 'ASC' : 'DESC';
  // NULLS LAST matters when ordering by published_at (nullable): undated rows
  // shouldn't bubble to the top of a newest-first feed.
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT ${SELECT_COLUMNS}
    FROM news_items
    ${whereSql}
    ORDER BY ${dateCol} ${dir} NULLS LAST, id ${dir}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `.trim();

  return { sql, values };
}

/**
 * Build a COUNT(*) over the same WHERE as `buildNewsListQuery` (ignoring
 * sort/limit/offset) so the list endpoint can report a `total`. Pure.
 */
export function buildNewsCountQuery(filters: NewsListFilters, now: Date = new Date()): BuiltQuery {
  const { where, values } = buildNewsWhere(filters, now);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT COUNT(*)::int AS total
    FROM news_items
    ${whereSql}
  `.trim();
  return { sql, values };
}
