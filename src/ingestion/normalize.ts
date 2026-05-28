import type { NormalizedEntry, RawEntry, Source, Status } from '../types';
import { canonicalizeUrl } from './url';
import { htmlToText, normalizeTitle, parseDate, detectLanguage } from './clean';
import { contentHash } from './hash';

export function sourceName(source: Source): string {
  return source.product ? `${source.company} · ${source.product}` : source.company;
}

/** Turn a raw fetched entry into a normalized, hashed entry (step 4 + 5). */
export function normalizeEntry(source: Source, raw: RawEntry): NormalizedEntry {
  const title = normalizeTitle(raw.title);
  const url = canonicalizeUrl(raw.url);
  const body = htmlToText(raw.content ?? '');
  const publishedAt = parseDate(raw.publishedAt ?? null);
  const language = detectLanguage(`${title}\n${body}`);

  return {
    company: source.company,
    product: source.product,
    title,
    url,
    body,
    contentOriginal: raw.content ?? '',
    publishedAt,
    sourceName: sourceName(source),
    sourceLanguage: language,
    contentHash: contentHash(url, title, body),
  };
}

/**
 * Decide the publication status + verified flag for an item (steps 7, 10, 11).
 * Verification is purely domain-based — the LLM never decides verification.
 */
export function decideOutcome(params: {
  domainVerified: boolean;
  classifyConfidence: number;
  summaryConfidence: number;
}): { status: Status; verified: boolean } {
  const verified = params.domainVerified;
  if (!verified) {
    // Off-domain link from an official source: keep for a human to review.
    return { status: 'needs_review', verified: false };
  }
  const confident = params.summaryConfidence >= 0.6 && params.classifyConfidence >= 0.5;
  return { status: confident ? 'published' : 'needs_review', verified: true };
}
