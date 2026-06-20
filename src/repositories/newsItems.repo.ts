import { query } from '../db/pool';
import type { Category, ImpactLevel, NewsItem, Status } from '../types';
import { buildNewsListQuery, buildNewsCountQuery, type NewsListFilters } from './newsQuery';

interface NewsRow {
  id: number;
  company: string;
  product: string | null;
  title_original: string;
  title_ar: string | null;
  title_en: string | null;
  summary_ar: string | null;
  summary_en: string | null;
  content_original: string;
  official_source_url: string;
  image_url: string | null;
  source_name: string;
  source_language: string;
  category: Category | null;
  tags: string[];
  impact_level: ImpactLevel;
  verified: boolean;
  published_at: Date | null;
  detected_at: Date;
  content_hash: string;
  status: Status;
  source_id: number | null;
  created_at: Date;
  updated_at: Date;
}

function map(row: NewsRow): NewsItem {
  return { ...row, tags: row.tags ?? [] };
}

export async function existsByHash(contentHash: string): Promise<boolean> {
  const { rows } = await query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM news_items WHERE content_hash = $1) AS exists`,
    [contentHash],
  );
  return rows[0]?.exists ?? false;
}

export async function listNews(filters: NewsListFilters): Promise<NewsItem[]> {
  const { sql, values } = buildNewsListQuery(filters);
  const { rows } = await query<NewsRow>(sql, values);
  return rows.map(map);
}

/** Total rows matching the same filters as `listNews` (ignores limit/offset). */
export async function countNews(filters: NewsListFilters): Promise<number> {
  const { sql, values } = buildNewsCountQuery(filters);
  const { rows } = await query<{ total: number }>(sql, values);
  return rows[0]?.total ?? 0;
}

export async function getNewsById(id: number): Promise<NewsItem | null> {
  const { rows } = await query<NewsRow>(`SELECT * FROM news_items WHERE id = $1`, [id]);
  return rows[0] ? map(rows[0]) : null;
}

export interface InsertNewsInput {
  company: string;
  product: string | null;
  title_original: string;
  title_ar: string | null;
  title_en: string | null;
  summary_ar: string | null;
  summary_en: string | null;
  content_original: string;
  official_source_url: string;
  image_url: string | null;
  source_name: string;
  source_language: string;
  category: Category | null;
  tags: string[];
  impact_level: ImpactLevel;
  verified: boolean;
  published_at: Date | null;
  content_hash: string;
  status: Status;
  source_id: number | null;
}

/**
 * Insert a news item. Relies on the content_hash UNIQUE constraint to guarantee
 * dedup even under concurrency; returns null if a duplicate already existed.
 */
export async function insertNews(input: InsertNewsInput): Promise<NewsItem | null> {
  const { rows } = await query<NewsRow>(
    `
    INSERT INTO news_items (
      company, product, title_original, title_ar, title_en, summary_ar, summary_en,
      content_original, official_source_url, image_url, source_name, source_language,
      category, tags, impact_level, verified, published_at, content_hash, status, source_id
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
    )
    ON CONFLICT (content_hash) DO NOTHING
    RETURNING *
    `,
    [
      input.company,
      input.product,
      input.title_original,
      input.title_ar,
      input.title_en,
      input.summary_ar,
      input.summary_en,
      input.content_original,
      input.official_source_url,
      input.image_url,
      input.source_name,
      input.source_language,
      input.category,
      input.tags,
      input.impact_level,
      input.verified,
      input.published_at ? input.published_at.toISOString() : null,
      input.content_hash,
      input.status,
      input.source_id,
    ],
  );
  return rows[0] ? map(rows[0]) : null;
}

/**
 * Items eligible for LLM (re)enrichment: domain-verified but still in
 * needs_review (e.g. ingested before an LLM was configured, or beyond a run's
 * enrichment budget). Most recent first.
 */
export async function listForEnrichment(limit: number): Promise<NewsItem[]> {
  const { rows } = await query<NewsRow>(
    `SELECT * FROM news_items
     WHERE status = 'needs_review' AND verified = TRUE
     ORDER BY detected_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(500, limit))],
  );
  return rows.map(map);
}

export interface EnrichmentUpdate {
  title_ar: string | null;
  title_en: string | null;
  summary_ar: string | null;
  summary_en: string | null;
  category: Category | null;
  tags: string[];
  impact_level: ImpactLevel;
  status: Status;
}

/** Apply LLM enrichment to an existing item. */
export async function updateEnrichment(id: number, u: EnrichmentUpdate): Promise<void> {
  await query(
    `UPDATE news_items SET
       title_ar = $2, title_en = $3, summary_ar = $4, summary_en = $5,
       category = $6, tags = $7, impact_level = $8, status = $9, updated_at = now()
     WHERE id = $1`,
    [id, u.title_ar, u.title_en, u.summary_ar, u.summary_en, u.category, u.tags, u.impact_level, u.status],
  );
}

/** Digest: items within a window, grouped client-side by the route. */
export async function digestItems(sinceIso: string): Promise<NewsItem[]> {
  const { rows } = await query<NewsRow>(
    `
    SELECT * FROM news_items
    WHERE detected_at >= $1::timestamptz
      AND status = 'published'
    ORDER BY company ASC, category ASC, detected_at DESC
    `,
    [sinceIso],
  );
  return rows.map(map);
}
