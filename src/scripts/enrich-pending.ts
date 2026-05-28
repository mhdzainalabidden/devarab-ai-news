import { fileURLToPath } from 'node:url';
import { listForEnrichment, updateEnrichment } from '../repositories/newsItems.repo';
import { enrich } from '../llm/enrich';
import { decideOutcome } from '../ingestion/normalize';
import { htmlToText } from '../ingestion/clean';
import { config } from '../config';
import { closePool } from '../db/pool';
import { logger } from '../logger';

/**
 * Backfill LLM enrichment onto domain-verified items still in `needs_review`
 * (e.g. ingested before an LLM was configured, or beyond a run's budget).
 * Bounded by a `limit` so it stays within free-tier daily request caps.
 *
 *   npm run enrich            # default 10 items
 *   npm run enrich -- 25      # 25 items
 */
export async function enrichPending(limit: number): Promise<{ processed: number; published: number }> {
  if (!config.llm.enabled) {
    logger.warn('enrich skipped: no LLM configured (set LLM_BASE_URL + LLM_API_KEY + LLM_MODEL)');
    return { processed: 0, published: 0 };
  }

  const items = await listForEnrichment(limit);
  let published = 0;
  const pace = config.llm.minIntervalMs;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (i > 0 && pace > 0) await new Promise((r) => setTimeout(r, pace));
    const body = htmlToText(item.content_original) || item.title_original;
    const e = await enrich({
      title: item.title_original,
      body,
      company: item.company,
      product: item.product,
      sourceLanguage: item.source_language,
    });

    // These rows are already domain-verified.
    const outcome = decideOutcome({
      domainVerified: true,
      classifyConfidence: e.confidence,
      summaryConfidence: e.confidence,
    });
    if (outcome.status === 'published') published += 1;

    await updateEnrichment(item.id, {
      title_ar: e.title_ar,
      title_en: e.title_en,
      summary_ar: e.summary_ar,
      summary_en: e.summary_en,
      category: e.category,
      tags: e.tags,
      impact_level: e.impact,
      status: outcome.status,
    });
    logger.info('enriched item', { id: item.id, company: item.company, status: outcome.status });
  }

  return { processed: items.length, published };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const limit = Number(process.argv[2]) || 10;
  enrichPending(limit)
    .then(({ processed, published }) => logger.info('enrich finished', { processed, published }))
    .catch((err) => {
      logger.error('enrich failed', { error: (err as Error).message });
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
