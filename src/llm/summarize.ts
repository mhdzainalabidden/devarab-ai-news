import { logger } from '../logger';
import type { BilingualSummary } from '../types';
import { truncate, normalizeTitle } from '../ingestion/clean';
import { extractJson } from './client';
import { getProvider } from './provider';

export interface SummarizeInput {
  title: string;
  body: string;
  company: string;
  product: string | null;
  sourceLanguage: string;
}

/**
 * Build a low-confidence fallback summary when the LLM is unavailable.
 * Arabic fields fall back to the original text (no machine translation without
 * the LLM); the low confidence routes the item to `needs_review` so a human can
 * complete the Arabic copy. English is the original when the source is English.
 */
export function fallbackSummary(input: SummarizeInput): BilingualSummary {
  const title = normalizeTitle(input.title);
  const excerpt = truncate(input.body || title, 280);
  const isEnglish = input.sourceLanguage !== 'ar';
  return {
    title_ar: title,
    summary_ar: excerpt,
    title_en: isEnglish ? title : title,
    summary_en: excerpt,
    confidence: 0.2,
  };
}

/** Coerce raw LLM output into a valid BilingualSummary. Returns null if unusable. */
export function normalizeSummary(raw: unknown): BilingualSummary | null {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const title_ar = str(obj.title_ar);
  const summary_ar = str(obj.summary_ar);
  const title_en = str(obj.title_en);
  const summary_en = str(obj.summary_en);
  if (!title_ar || !summary_ar || !title_en || !summary_en) return null;
  let confidence = Number(obj.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.85;
  return {
    title_ar,
    summary_ar,
    title_en,
    summary_en,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

const SYSTEM = `You write concise, accurate, developer-focused news summaries for an Arabic developer audience (Dev Arab).
Arabic is the PRIMARY output; English is secondary. Rules:
- Be faithful to the source. Do NOT invent facts, versions, dates, or numbers.
- Keep it short and practical: what changed and why a developer should care.
- title_ar / title_en: max ~90 characters, no trailing period.
- summary_ar / summary_en: 1-3 sentences each.
- Arabic must be Modern Standard Arabic, natural and fluent, keeping product/model names and code identifiers in Latin script (e.g. GPT-5, Claude, API, SDK).
- Return ONLY a JSON object, no prose:
{ "title_ar": "...", "summary_ar": "...", "title_en": "...", "summary_en": "...", "confidence": 0..1 }
Set confidence low (<0.5) if the source text is too sparse or ambiguous to summarize faithfully.`;

export async function summarize(input: SummarizeInput): Promise<BilingualSummary> {
  const provider = getProvider('summarize');
  if (!provider) {
    return fallbackSummary(input);
  }
  try {
    const userText = `Company: ${input.company}\nProduct: ${input.product ?? 'n/a'}\nSource language: ${input.sourceLanguage}\nTitle: ${input.title}\n\nBody:\n${truncate(input.body, 6000)}`;
    const text = await provider.complete({ system: SYSTEM, user: userText, maxTokens: 2048, json: true });
    const parsed = extractJson(text);
    const normalized = parsed ? normalizeSummary(parsed) : null;
    if (!normalized) {
      logger.warn('summarize: unusable LLM output; using fallback', { title: input.title });
      return fallbackSummary(input);
    }
    return normalized;
  } catch (err) {
    logger.warn('summarize: LLM call failed; using fallback', {
      error: (err as Error).message,
      title: input.title,
    });
    return fallbackSummary(input);
  }
}
