import { logger } from '../logger';
import { CATEGORIES, IMPACT_LEVELS, type Category, type ImpactLevel } from '../types';
import { truncate } from '../ingestion/clean';
import { extractJson } from './client';
import { getProvider } from './provider';
import { classifyHeuristic } from './heuristics';
import { normalizeClassification } from './classify';
import { normalizeSummary, fallbackSummary } from './summarize';

export interface EnrichInput {
  title: string;
  body: string;
  company: string;
  product: string | null;
  sourceLanguage: string;
}

/** Combined classification + bilingual (Arabic-first) summary from a single LLM call. */
export interface Enrichment {
  category: Category;
  tags: string[];
  impact: ImpactLevel;
  title_ar: string;
  summary_ar: string;
  title_en: string;
  summary_en: string;
  /** 0..1 — drives the publish/needs_review decision. */
  confidence: number;
}

/** No-LLM fallback: heuristic classification + original-text summary at low confidence. */
export function fallbackEnrichment(input: EnrichInput): Enrichment {
  const h = classifyHeuristic(input.title, input.body);
  const fb = fallbackSummary(input);
  return {
    category: h.category,
    tags: h.tags,
    impact: h.impact,
    title_ar: fb.title_ar,
    summary_ar: fb.summary_ar,
    title_en: fb.title_en,
    summary_en: fb.summary_en,
    confidence: fb.confidence, // 0.2 -> routes to needs_review
  };
}

/** Coerce raw merged LLM output into a valid Enrichment, falling back per-section. */
export function normalizeEnrichment(raw: unknown, fb: Enrichment): Enrichment {
  const cls = normalizeClassification(raw, { category: fb.category, impact: fb.impact, tags: fb.tags });
  const sum = normalizeSummary(raw);
  if (!sum) {
    // Classification is usable but the summary isn't — keep the heuristic summary
    // and force low confidence so a human reviews the Arabic copy.
    return {
      category: cls.category,
      tags: cls.tags,
      impact: cls.impact,
      title_ar: fb.title_ar,
      summary_ar: fb.summary_ar,
      title_en: fb.title_en,
      summary_en: fb.summary_en,
      confidence: Math.min(cls.confidence, 0.3),
    };
  }
  return {
    category: cls.category,
    tags: cls.tags,
    impact: cls.impact,
    title_ar: sum.title_ar,
    summary_ar: sum.summary_ar,
    title_en: sum.title_en,
    summary_en: sum.summary_en,
    confidence: cls.confidence,
  };
}

const SYSTEM = `You enrich official AI product-news for "Dev Arab", an Arabic developer-news service.
For ONE news item you do BOTH tasks at once and return ONLY a single JSON object (no prose, no markdown).

Arabic is the PRIMARY output; English is secondary. Faithfully translate and summarize the (usually English) source into Modern Standard Arabic.

JSON schema:
{
  "category": one of ["model","api","coding","security","pricing","research","tool","sdk","product","company","deprecation"],
  "tags": array of 2-6 short lowercase keyword tags (e.g. "gpt-5","pricing","sdk"),
  "impact": one of ["low","medium","high","critical"] (critical = security/outage/major breaking; high = new flagship model, GA launch, pricing change, deprecation; medium = features/SDK/API updates; low = minor/informational),
  "title_ar": "Arabic title, <= ~90 chars, no trailing period",
  "summary_ar": "1-3 sentence Arabic summary, developer-focused",
  "title_en": "short English title",
  "summary_en": "1-3 sentence English summary",
  "confidence": number 0..1
}

Rules:
- Be faithful. Do NOT invent facts, versions, numbers, or dates.
- Arabic must be natural Modern Standard Arabic, but keep product/model names and code identifiers in Latin script (e.g. GPT-5, Claude, API, SDK, npm).
- Make it short, clear, and useful: what changed and why a developer should care.
- Set confidence < 0.5 if the source text is too sparse or ambiguous to summarize faithfully.`;

export async function enrich(input: EnrichInput): Promise<Enrichment> {
  const fb = fallbackEnrichment(input);
  // One model serves both tasks; reuse the summarize model slot.
  const provider = getProvider('summarize');
  if (!provider) return fb;

  try {
    const userText = `Company: ${input.company}\nProduct: ${input.product ?? 'n/a'}\nSource language: ${input.sourceLanguage}\nTitle: ${input.title}\n\nBody:\n${truncate(input.body, 6000)}`;
    // Generous budget: "thinking" models (e.g. Gemini 2.5 Flash) spend output
    // tokens on internal reasoning before emitting the JSON. json mode enforces
    // strictly-parseable output.
    const text = await provider.complete({ system: SYSTEM, user: userText, maxTokens: 2048, json: true });
    const parsed = extractJson(text);
    if (!parsed) {
      logger.warn('enrich: could not parse LLM JSON; using fallback', { title: input.title });
      return fb;
    }
    return normalizeEnrichment(parsed, fb);
  } catch (err) {
    logger.warn('enrich: LLM call failed; using fallback', {
      error: (err as Error).message,
      title: input.title,
    });
    return fb;
  }
}
