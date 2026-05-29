// Shared domain types for the Dev Arab AI news subsystem.

export const CATEGORIES = [
  'model',
  'api',
  'coding',
  'security',
  'pricing',
  'research',
  'tool',
  'sdk',
  'product',
  'company',
  'deprecation',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const IMPACT_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

export const STATUSES = ['draft', 'published', 'ignored', 'duplicate', 'needs_review'] as const;
export type Status = (typeof STATUSES)[number];

// How a source is fetched. Drives which fetcher is used during ingestion.
export const SOURCE_TYPES = ['rss', 'html', 'github', 'playwright'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type SourceLanguage = 'en' | 'ar' | string;

/** A tracked official source. Mirrors the `sources` table. */
export interface Source {
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
  // Fetcher-specific configuration (HTML selectors, GitHub repo coords, etc.).
  // Not part of the core spec columns but required for generic HTML/GitHub fetching.
  extra: SourceExtra | null;
  created_at?: Date;
  updated_at?: Date;
}

/** Per-source-type fetching configuration stored in `sources.extra` (jsonb). */
export interface SourceExtra {
  // For source_type === 'html' (and 'playwright').
  html?: HtmlFetchConfig;
  // For source_type === 'github'.
  github?: GithubFetchConfig;
}

export interface HtmlFetchConfig {
  /** CSS selector matching each item/post/changelog-entry container. */
  itemSelector: string;
  /** CSS selector (relative to item) for the title text. Defaults to the item itself. */
  titleSelector?: string;
  /** CSS selector (relative to item) for the anchor whose href is the item URL. */
  linkSelector?: string;
  /** Attribute on the link element to read the URL from. Defaults to "href". */
  linkAttr?: string;
  /** CSS selector (relative to item) for a date/time string or [datetime] element. */
  dateSelector?: string;
  /** CSS selector (relative to item) for the body/excerpt text. */
  contentSelector?: string;
  /** CSS selector (relative to item) for a thumbnail image (reads src/data-src/content). */
  imageSelector?: string;
  /** Base URL used to resolve relative hrefs. Defaults to the source_url origin. */
  baseUrl?: string;
}

export interface GithubFetchConfig {
  owner: string;
  repo: string;
  /** releases (default): GitHub Releases. commits: recent commits. file: track a changelog file. */
  mode?: 'releases' | 'commits' | 'file';
  /** For mode === 'file' — path to the changelog file, e.g. "CHANGELOG.md". */
  path?: string;
  /** For mode === 'commits' — restrict to a branch. */
  branch?: string;
}

/** Raw, unnormalized entry returned by a fetcher. */
export interface RawEntry {
  title: string;
  url: string;
  /** Raw HTML or text body as fetched, stored for audit. */
  content: string;
  /** ISO string or parseable date, if the source exposed one. */
  publishedAt?: string | Date | null;
  /** Thumbnail/preview image URL, if the feed/listing exposed one. */
  imageUrl?: string | null;
}

/** A normalized entry ready for hashing, verification, and enrichment. */
export interface NormalizedEntry {
  company: string;
  product: string | null;
  title: string;
  /** Absolute, canonicalized URL. */
  url: string;
  /** Cleaned plain-text body. */
  body: string;
  /** Original raw content (HTML/text) preserved for audit. */
  contentOriginal: string;
  publishedAt: Date | null;
  sourceName: string;
  sourceLanguage: SourceLanguage;
  contentHash: string;
  /** Validated absolute image URL, or null. */
  imageUrl: string | null;
}

/** Output of the classification step. */
export interface Classification {
  category: Category;
  tags: string[];
  impact: ImpactLevel;
  /** 0..1 — how confident the classifier is. */
  confidence: number;
}

/** Output of the bilingual summarization step. */
export interface BilingualSummary {
  title_ar: string;
  summary_ar: string;
  title_en: string;
  summary_en: string;
  /** 0..1 — how confident the generator is the summary is faithful. */
  confidence: number;
}

/** A persisted news item. Mirrors the `news_items` table. */
export interface NewsItem {
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
  source_language: SourceLanguage;
  category: Category | null;
  tags: string[];
  impact_level: ImpactLevel;
  verified: boolean;
  published_at: Date | null;
  detected_at: Date;
  content_hash: string;
  status: Status;
  source_id: number | null;
  created_at?: Date;
  updated_at?: Date;
}

/** A record of one ingestion job run, used for health + audit. */
export interface JobRun {
  id: number;
  job_name: string;
  started_at: Date;
  finished_at: Date | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  sources_checked: number;
  items_found: number;
  items_inserted: number;
  items_skipped: number;
  errors: number;
  detail: Record<string, unknown> | null;
}
