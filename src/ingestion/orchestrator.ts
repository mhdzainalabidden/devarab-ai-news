import type { Source } from '../types';
import { logger } from '../logger';
import { config } from '../config';

import * as sourcesRepo from '../repositories/sources.repo';
import * as newsRepo from '../repositories/newsItems.repo';
import * as jobsRepo from '../repositories/jobRuns.repo';

import { fetchSource as defaultFetchSource } from './fetchers';
import { normalizeEntry, decideOutcome } from './normalize';
import { verifyOfficialDomain } from './url';
import { robotsChecker, type RobotsChecker } from './robots';
import { enrich as defaultEnrich, fallbackEnrichment } from '../llm/enrich';
import { isContentlessVersionTag } from '../llm/heuristics';

export interface IngestionResult {
  jobRunId: number | null;
  sourcesChecked: number;
  itemsFound: number;
  itemsInserted: number;
  itemsSkipped: number;
  errors: number;
  perSource: { source_id: number; company: string; found: number; inserted: number; error?: string }[];
}

/** Injectable dependencies — defaults use the real repos/fetchers/LLM. */
export interface OrchestratorDeps {
  findDueSources: (now: Date) => Promise<Source[]>;
  listSources: () => Promise<Source[]>;
  markChecked: (id: number, success: boolean, now: Date) => Promise<void>;
  existsByHash: (hash: string) => Promise<boolean>;
  insertNews: typeof newsRepo.insertNews;
  fetchSource: typeof defaultFetchSource;
  enrich: typeof defaultEnrich;
  robots: RobotsChecker;
  startJobRun: (name: string) => Promise<number | null>;
  finishJobRun: (id: number, update: jobsRepo.JobRunUpdate) => Promise<void>;
  now: () => Date;
}

function defaultDeps(): OrchestratorDeps {
  return {
    findDueSources: (now) => sourcesRepo.findDueSources(now),
    listSources: () => sourcesRepo.listSources(),
    markChecked: (id, success, now) => sourcesRepo.markChecked(id, success, now),
    existsByHash: (hash) => newsRepo.existsByHash(hash),
    insertNews: newsRepo.insertNews,
    fetchSource: defaultFetchSource,
    enrich: defaultEnrich,
    robots: robotsChecker,
    startJobRun: (name) => jobsRepo.startJobRun(name),
    finishJobRun: (id, update) => jobsRepo.finishJobRun(id, update),
    now: () => new Date(),
  };
}

export interface RunOptions {
  /** Ignore crawl intervals and check every active source. */
  force?: boolean;
  /** Restrict to specific source ids. */
  sourceIds?: number[];
}

/**
 * The hourly ingestion workflow (steps 1-12). Loads due sources, fetches,
 * normalizes, dedups, verifies domains, enriches via LLM, and persists.
 */
export async function runIngestion(
  options: RunOptions = {},
  overrides: Partial<OrchestratorDeps> = {},
): Promise<IngestionResult> {
  const deps: OrchestratorDeps = { ...defaultDeps(), ...overrides };
  const now = deps.now();
  const maxItems = config.ingestion.maxItemsPerSource;

  const jobRunId = await deps.startJobRun('ingestion');

  // Step 1: load active sources due for checking.
  let sources = options.force ? await deps.listSources() : await deps.findDueSources(now);
  sources = sources.filter((s) => s.active);
  if (options.sourceIds && options.sourceIds.length > 0) {
    const set = new Set(options.sourceIds);
    sources = sources.filter((s) => set.has(s.id));
  }

  const result: IngestionResult = {
    jobRunId,
    sourcesChecked: 0,
    itemsFound: 0,
    itemsInserted: 0,
    itemsSkipped: 0,
    errors: 0,
    perSource: [],
  };

  // Per-run LLM enrichment budget (0 = unlimited). Verified items beyond the cap
  // are stored via heuristics as needs_review and can be enriched later
  // (npm run enrich), which keeps free-tier daily request limits in check.
  const enrichCap = config.llm.maxEnrichPerRun;
  let enrichedCount = 0;

  for (const source of sources) {
    const log = logger.child({ source_id: source.id, company: source.company, url: source.source_url });
    const perSource = { source_id: source.id, company: source.company, found: 0, inserted: 0 } as
      IngestionResult['perSource'][number];
    result.sourcesChecked += 1;

    try {
      // Respect robots.txt for crawled pages (RSS/HTML/Playwright). GitHub uses the API.
      if (source.source_type !== 'github') {
        const allowed = await deps.robots.isAllowed(source.source_url);
        if (!allowed) {
          log.warn('skipped by robots.txt');
          await deps.markChecked(source.id, true, now);
          perSource.error = 'disallowed-by-robots';
          result.perSource.push(perSource);
          continue;
        }
      }

      // Step 2 + 3: fetch + extract latest entries.
      const rawEntries = await deps.fetchSource(source, maxItems);
      result.itemsFound += rawEntries.length;
      perSource.found = rawEntries.length;

      for (const raw of rawEntries) {
        // Step 4 + 5: normalize + content hash.
        const entry = normalizeEntry(source, raw);

        // Step 6: skip duplicates.
        if (await deps.existsByHash(entry.contentHash)) {
          result.itemsSkipped += 1;
          continue;
        }

        // Step 6.5: drop contentless version/build/date tag releases ("v0.111.0",
        // "b9724", "aws-sdk: v0.5.0"). They carry no narrative, so they're not
        // persisted — keeping needs_review clean, the DB lean, and LLM spend at
        // zero. The dedup hash is deterministic, so they re-filter cheaply each run.
        if (isContentlessVersionTag(entry.title, entry.body)) {
          result.itemsSkipped += 1;
          continue;
        }

        // Step 7: verify URL domain matches official_domain.
        const domainVerified = verifyOfficialDomain(entry.url, source.official_domain);

        // Steps 8 + 9: one merged LLM call — classification + Arabic-first bilingual
        // summaries. Only spend LLM budget on domain-verified items; off-domain
        // links go straight to needs_review without enrichment.
        let confidence = 0.2;
        let category: Awaited<ReturnType<typeof deps.enrich>>['category'] | null = null;
        let tags: string[] = [];
        let impact: Awaited<ReturnType<typeof deps.enrich>>['impact'] = 'low';
        let titleAr: string | null = null;
        let summaryAr: string | null = null;
        let titleEn: string | null = null;
        let summaryEn: string | null = null;

        if (domainVerified) {
          const withinBudget = enrichCap === 0 || enrichedCount < enrichCap;
          // Within budget -> real LLM enrichment; over budget -> heuristic now,
          // backfill later via `npm run enrich`.
          const e = withinBudget
            ? await deps.enrich({
                title: entry.title,
                body: entry.body,
                company: entry.company,
                product: entry.product,
                sourceLanguage: entry.sourceLanguage,
              })
            : fallbackEnrichment({
                title: entry.title,
                body: entry.body,
                company: entry.company,
                product: entry.product,
                sourceLanguage: entry.sourceLanguage,
              });
          if (withinBudget) {
            enrichedCount += 1;
            // Pace LLM calls to respect free-tier per-minute limits.
            if (config.llm.minIntervalMs > 0) {
              await new Promise((r) => setTimeout(r, config.llm.minIntervalMs));
            }
          }
          confidence = e.confidence;
          category = e.category;
          tags = e.tags;
          impact = e.impact;
          titleAr = e.title_ar;
          summaryAr = e.summary_ar;
          titleEn = e.title_en;
          summaryEn = e.summary_en;
        }

        // Steps 10 + 11: decide status + verified flag. A single enrichment
        // confidence gates both classification and summary quality.
        const outcome = decideOutcome({
          domainVerified,
          classifyConfidence: confidence,
          summaryConfidence: confidence,
        });

        const inserted = await deps.insertNews({
          company: entry.company,
          product: entry.product,
          title_original: entry.title,
          title_ar: titleAr,
          title_en: titleEn,
          summary_ar: summaryAr,
          summary_en: summaryEn,
          content_original: entry.contentOriginal,
          official_source_url: entry.url,
          image_url: entry.imageUrl,
          source_name: entry.sourceName,
          source_language: entry.sourceLanguage,
          category,
          tags,
          impact_level: impact,
          verified: outcome.verified,
          published_at: entry.publishedAt,
          content_hash: entry.contentHash,
          status: outcome.status,
          source_id: source.id,
        });

        if (inserted) {
          result.itemsInserted += 1;
          perSource.inserted += 1;
        } else {
          // Lost an insert race on content_hash — counts as a dedup skip.
          result.itemsSkipped += 1;
        }
      }

      await deps.markChecked(source.id, true, now);
    } catch (err) {
      result.errors += 1;
      perSource.error = (err as Error).message;
      log.error('source ingestion failed', { error: (err as Error).message });
      await deps.markChecked(source.id, false, now).catch(() => {});
    }
    result.perSource.push(perSource);
  }

  const status = result.errors === 0 ? 'success' : result.itemsInserted > 0 || result.sourcesChecked > result.errors ? 'partial' : 'failed';

  if (jobRunId !== null) {
    await deps.finishJobRun(jobRunId, {
      status,
      sources_checked: result.sourcesChecked,
      items_found: result.itemsFound,
      items_inserted: result.itemsInserted,
      items_skipped: result.itemsSkipped,
      errors: result.errors,
      detail: { perSource: result.perSource, enriched: enrichedCount },
    });
  }

  logger.info('ingestion run complete', {
    enriched: enrichedCount,
    sourcesChecked: result.sourcesChecked,
    itemsFound: result.itemsFound,
    itemsInserted: result.itemsInserted,
    itemsSkipped: result.itemsSkipped,
    errors: result.errors,
    status,
  });

  return result;
}
