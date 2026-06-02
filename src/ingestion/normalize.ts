import type { NormalizedEntry, RawEntry, Source, Status } from '../types';
import { canonicalizeUrl, cleanImageUrl } from './url';
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
    // Resolve image relative to the (canonical) item URL; preserve signed query.
    imageUrl: cleanImageUrl(raw.imageUrl ?? null, url),
  };
}

/**
 * Decide the publication status + verified flag for an item (steps 7, 10, 11).
 * Verification is purely domain-based — the LLM never decides verification.
 *
 * Domain verification is the project's actual trust floor (the URL host matches
 * an official_domain on file). LLM confidence is only a "is this total garbage?"
 * gate, so thresholds are deliberately loose. With stricter thresholds, GitHub
 * release entries with terse titles (e.g. "v3.38.0") legitimately scored ~0.3-0.5
 * confidence and got parked in needs_review forever — the floor is domain trust,
 * not the LLM's certainty about a one-line title.
 */
const SUMMARY_CONFIDENCE_FLOOR = 0.25;
const CLASSIFY_CONFIDENCE_FLOOR = 0.2;

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
  const confident =
    params.summaryConfidence >= SUMMARY_CONFIDENCE_FLOOR &&
    params.classifyConfidence >= CLASSIFY_CONFIDENCE_FLOOR;
  return { status: confident ? 'published' : 'needs_review', verified: true };
}
