import { CATEGORIES, IMPACT_LEVELS, type Category, type ImpactLevel } from '../types';

export interface NewsListFilters {
  company?: string;
  product?: string;
  category?: Category;
  impact?: ImpactLevel;
  tag?: string;
  /** ISO timestamp or relative window like "24h" / "7d". Filters on detected_at >= since. */
  since?: string;
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
 * Build a parameterized SELECT for the news list endpoint. Pure: no DB access.
 * Sorted by detected_at DESC. All user inputs are bound as parameters.
 */
export function buildNewsListQuery(filters: NewsListFilters, now: Date = new Date()): BuiltQuery {
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

  const sinceDate = resolveSince(filters.since, now);
  if (sinceDate) add((i) => `detected_at >= $${i}`, sinceDate.toISOString());

  const limit = clampLimit(filters.limit);
  values.push(limit);
  const limitIdx = values.length;

  const offset = Math.max(0, Math.floor(filters.offset ?? 0));
  values.push(offset);
  const offsetIdx = values.length;

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT ${SELECT_COLUMNS}
    FROM news_items
    ${whereSql}
    ORDER BY detected_at DESC, id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `.trim();

  return { sql, values };
}
