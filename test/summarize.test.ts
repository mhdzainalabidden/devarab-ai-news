import { describe, it, expect } from 'vitest';
import { normalizeSummary, fallbackSummary, summarize } from '../src/llm/summarize';

describe('normalizeSummary', () => {
  it('accepts complete bilingual output', () => {
    const out = normalizeSummary({
      title_ar: 'عنوان',
      summary_ar: 'ملخص',
      title_en: 'Title',
      summary_en: 'Summary',
      confidence: 0.8,
    });
    expect(out).not.toBeNull();
    expect(out?.confidence).toBe(0.8);
  });

  it('rejects output missing a required field', () => {
    expect(
      normalizeSummary({ title_ar: 'x', summary_ar: 'y', title_en: 'z' /* summary_en missing */ }),
    ).toBeNull();
  });

  it('defaults confidence when absent', () => {
    const out = normalizeSummary({
      title_ar: 'a',
      summary_ar: 'b',
      title_en: 'c',
      summary_en: 'd',
    });
    expect(out?.confidence).toBe(0.85);
  });
});

describe('fallbackSummary', () => {
  it('produces low-confidence output that routes to needs_review', () => {
    const out = fallbackSummary({
      title: 'New model launched',
      body: 'Details about the new model and its capabilities.',
      company: 'OpenAI',
      product: null,
      sourceLanguage: 'en',
    });
    expect(out.confidence).toBeLessThan(0.5);
    expect(out.title_en).toContain('New model');
    expect(out.summary_ar.length).toBeGreaterThan(0);
  });
});

describe('summarize (LLM disabled -> fallback)', () => {
  it('returns the fallback summary when no API key is set', async () => {
    const out = await summarize({
      title: 'Pricing update',
      body: 'Prices changed.',
      company: 'Anthropic',
      product: 'Claude',
      sourceLanguage: 'en',
    });
    expect(out.confidence).toBe(0.2);
  });
});
