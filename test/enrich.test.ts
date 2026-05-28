import { describe, it, expect } from 'vitest';
import { normalizeEnrichment, fallbackEnrichment, enrich, type Enrichment } from '../src/llm/enrich';

const FB: Enrichment = {
  category: 'product',
  tags: ['x'],
  impact: 'low',
  title_ar: 'عنوان احتياطي',
  summary_ar: 'ملخص احتياطي',
  title_en: 'fallback title',
  summary_en: 'fallback summary',
  confidence: 0.2,
};

describe('normalizeEnrichment', () => {
  it('accepts a complete merged JSON object', () => {
    const out = normalizeEnrichment(
      {
        category: 'security',
        tags: ['CVE', 'patch'],
        impact: 'critical',
        title_ar: 'ثغرة أمنية حرجة',
        summary_ar: 'تم إصلاح ثغرة أمنية في الإصدار الأخير.',
        title_en: 'Critical security fix',
        summary_en: 'A CVE was patched in the latest release.',
        confidence: 0.92,
      },
      FB,
    );
    expect(out.category).toBe('security');
    expect(out.impact).toBe('critical');
    expect(out.tags).toEqual(['cve', 'patch']);
    expect(out.title_ar).toBe('ثغرة أمنية حرجة');
    expect(out.confidence).toBe(0.92);
  });

  it('keeps classification but forces low confidence when the summary is unusable', () => {
    const out = normalizeEnrichment(
      { category: 'model', tags: ['gpt'], impact: 'high', confidence: 0.9 /* no summary fields */ },
      FB,
    );
    expect(out.category).toBe('model');
    expect(out.impact).toBe('high');
    expect(out.title_ar).toBe(FB.title_ar); // fell back to heuristic summary
    expect(out.confidence).toBeLessThanOrEqual(0.3); // routes to needs_review
  });
});

describe('fallbackEnrichment', () => {
  it('uses heuristic classification + low confidence', () => {
    const out = fallbackEnrichment({
      title: 'Deprecating the old GPT-4 API endpoint',
      body: 'The legacy endpoint will be retired.',
      company: 'OpenAI',
      product: 'API',
      sourceLanguage: 'en',
    });
    expect(out.category).toBe('deprecation');
    expect(out.impact).toBe('high');
    expect(out.confidence).toBe(0.2);
  });
});

describe('enrich (LLM disabled -> fallback)', () => {
  it('returns the fallback enrichment when no LLM is configured', async () => {
    const out = await enrich({
      title: 'New pricing for the API',
      body: 'Prices dropped.',
      company: 'Anthropic',
      product: 'Claude',
      sourceLanguage: 'en',
    });
    expect(out.confidence).toBe(0.2);
    expect(out.category).toBe('pricing');
  });
});
