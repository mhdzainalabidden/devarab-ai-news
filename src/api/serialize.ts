import type { NewsItem } from '../types';

export type Lang = 'ar' | 'en' | 'both';

export function parseLang(value: unknown): Lang {
  if (value === 'ar' || value === 'en' || value === 'both') return value;
  return 'both';
}

export interface SerializedNewsItem {
  id: number;
  company: string;
  product: string | null;
  category: string | null;
  impact_level: string;
  verified: boolean;
  title_ar: string | null;
  summary_ar: string | null;
  title_en: string | null;
  summary_en: string | null;
  tags: string[];
  official_source_url: string;
  source_name: string;
  source_language: string;
  status: string;
  published_at: string | null;
  detected_at: string;
}

/**
 * Shape a stored item into the public API contract. All required bilingual
 * fields are always present as keys; `lang` controls which are populated
 * (ar/en null out the other language to reduce payload).
 */
export function serializeNewsItem(item: NewsItem, lang: Lang = 'both'): SerializedNewsItem {
  const wantAr = lang === 'ar' || lang === 'both';
  const wantEn = lang === 'en' || lang === 'both';
  return {
    id: item.id,
    company: item.company,
    product: item.product,
    category: item.category,
    impact_level: item.impact_level,
    verified: item.verified,
    title_ar: wantAr ? item.title_ar : null,
    summary_ar: wantAr ? item.summary_ar : null,
    title_en: wantEn ? item.title_en : null,
    summary_en: wantEn ? item.summary_en : null,
    tags: item.tags ?? [],
    official_source_url: item.official_source_url,
    source_name: item.source_name,
    source_language: item.source_language,
    status: item.status,
    published_at: item.published_at ? new Date(item.published_at).toISOString() : null,
    detected_at: new Date(item.detected_at).toISOString(),
  };
}

export interface DigestGroup {
  company: string;
  total: number;
  categories: { category: string; count: number; items: SerializedNewsItem[] }[];
}

/** Group published items by company then category for the digest endpoint. */
export function buildDigest(items: NewsItem[], lang: Lang): DigestGroup[] {
  const byCompany = new Map<string, Map<string, NewsItem[]>>();
  for (const item of items) {
    const company = item.company;
    const category = item.category ?? 'uncategorized';
    if (!byCompany.has(company)) byCompany.set(company, new Map());
    const cats = byCompany.get(company)!;
    if (!cats.has(category)) cats.set(category, []);
    cats.get(category)!.push(item);
  }

  const groups: DigestGroup[] = [];
  for (const [company, cats] of byCompany) {
    let total = 0;
    const categories = [...cats.entries()].map(([category, list]) => {
      total += list.length;
      return {
        category,
        count: list.length,
        items: list.map((i) => serializeNewsItem(i, lang)),
      };
    });
    categories.sort((a, b) => b.count - a.count);
    groups.push({ company, total, categories });
  }
  groups.sort((a, b) => b.total - a.total);
  return groups;
}
