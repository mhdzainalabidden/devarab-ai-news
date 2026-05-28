import { logger } from '../logger';
import { CATEGORIES, IMPACT_LEVELS, type Category, type Classification, type ImpactLevel } from '../types';
import { truncate } from '../ingestion/clean';
import { extractJson } from './client';
import { getProvider } from './provider';
import { classifyHeuristic } from './heuristics';

export interface ClassifyInput {
  title: string;
  body: string;
  company: string;
  product: string | null;
}

/** Coerce raw LLM output into a valid Classification, using `fallback` for bad fields. */
export function normalizeClassification(
  raw: unknown,
  fallback: { category: Category; impact: ImpactLevel; tags: string[] },
): Classification {
  const obj = (raw ?? {}) as Record<string, unknown>;

  // Tolerate case/whitespace variants from the model (e.g. "Security", "High ").
  const catRaw = String(obj.category ?? '').toLowerCase().trim();
  const category = (CATEGORIES as readonly string[]).includes(catRaw)
    ? (catRaw as Category)
    : fallback.category;

  const impRaw = String(obj.impact ?? '').toLowerCase().trim();
  const impact = (IMPACT_LEVELS as readonly string[]).includes(impRaw)
    ? (impRaw as ImpactLevel)
    : fallback.impact;

  let tags: string[] = [];
  if (Array.isArray(obj.tags)) {
    tags = obj.tags
      .map((t) => String(t).toLowerCase().trim())
      .filter((t) => t.length > 0 && t.length <= 40)
      .slice(0, 8);
  }
  if (tags.length === 0) tags = fallback.tags;

  let confidence = Number(obj.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.6;
  confidence = Math.max(0, Math.min(1, confidence));

  return { category, impact, tags, confidence };
}

const SYSTEM = `You are a precise news classifier for developer-facing AI product news.
Classify the item and return ONLY a JSON object, no prose. Schema:
{
  "category": one of ["model","api","coding","security","pricing","research","tool","sdk","product","company","deprecation"],
  "tags": array of 2-6 short lowercase keyword tags (e.g. "gpt-5","pricing","sdk"),
  "impact": one of ["low","medium","high","critical"] (critical = security/outage/major breaking; high = new flagship model, GA launch, pricing change, deprecation; medium = features/SDK/API updates; low = minor or informational),
  "confidence": number 0..1 reflecting how clearly the text fits the category
}`;

export async function classify(input: ClassifyInput): Promise<Classification> {
  const fallback = classifyHeuristic(input.title, input.body);
  const provider = getProvider('classify');
  if (!provider) {
    return { ...fallback, confidence: 0.5 };
  }

  try {
    const userText = `Company: ${input.company}\nProduct: ${input.product ?? 'n/a'}\nTitle: ${input.title}\n\nBody:\n${truncate(input.body, 4000)}`;
    const text = await provider.complete({ system: SYSTEM, user: userText, maxTokens: 1024, json: true });
    const parsed = extractJson(text);
    if (!parsed) {
      logger.warn('classify: could not parse LLM JSON; using heuristic', { title: input.title });
      return { ...fallback, confidence: 0.5 };
    }
    return normalizeClassification(parsed, fallback);
  } catch (err) {
    logger.warn('classify: LLM call failed; using heuristic', {
      error: (err as Error).message,
      title: input.title,
    });
    return { ...fallback, confidence: 0.5 };
  }
}
