import { describe, it, expect } from 'vitest';
import { normalizeClassification, classify } from '../src/llm/classify';

const FALLBACK = { category: 'product' as const, impact: 'low' as const, tags: ['x'] };

describe('normalizeClassification', () => {
  it('accepts valid LLM output', () => {
    const out = normalizeClassification(
      { category: 'security', impact: 'critical', tags: ['CVE', 'patch'], confidence: 0.9 },
      FALLBACK,
    );
    expect(out.category).toBe('security');
    expect(out.impact).toBe('critical');
    expect(out.tags).toEqual(['cve', 'patch']);
    expect(out.confidence).toBe(0.9);
  });

  it('falls back on invalid category/impact', () => {
    const out = normalizeClassification({ category: 'nonsense', impact: 'huge' }, FALLBACK);
    expect(out.category).toBe('product');
    expect(out.impact).toBe('low');
    expect(out.tags).toEqual(['x']);
  });

  it('clamps confidence into [0,1]', () => {
    expect(normalizeClassification({ confidence: 5 }, FALLBACK).confidence).toBe(1);
    expect(normalizeClassification({ confidence: -2 }, FALLBACK).confidence).toBe(0);
    expect(normalizeClassification({ confidence: 'nope' }, FALLBACK).confidence).toBe(0.6);
  });

  it('limits tags to 8 and drops empties', () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    const out = normalizeClassification({ tags: ['', ...many] }, FALLBACK);
    expect(out.tags.length).toBe(8);
  });
});

describe('classify (LLM disabled -> heuristic)', () => {
  it('classifies via heuristic when no API key is set', async () => {
    const out = await classify({
      title: 'Critical security advisory: vulnerability patched',
      body: 'A CVE was fixed in the latest release.',
      company: 'OpenAI',
      product: 'API',
    });
    expect(out.category).toBe('security');
    expect(out.confidence).toBe(0.5); // heuristic confidence
  });
});
