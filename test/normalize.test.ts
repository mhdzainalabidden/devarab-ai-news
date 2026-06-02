import { describe, it, expect } from 'vitest';
import { normalizeEntry, decideOutcome, sourceName } from '../src/ingestion/normalize';
import { makeSource } from './fixtures';

describe('normalizeEntry', () => {
  it('normalizes title/url/body and computes a hash', () => {
    const source = makeSource();
    const entry = normalizeEntry(source, {
      title: '  New   Model\nReleased ',
      url: 'https://openai.com/news/x/?utm_source=tw',
      content: '<p>Hello <b>world</b></p><script>x()</script>',
      publishedAt: '2026-05-28T10:00:00Z',
      imageUrl: '/img/x.png',
    });
    expect(entry.title).toBe('New Model Released');
    expect(entry.url).toBe('https://openai.com/news/x');
    expect(entry.imageUrl).toBe('https://openai.com/img/x.png'); // resolved absolute
    expect(entry.body).toContain('Hello world');
    expect(entry.body).not.toContain('<');
    expect(entry.contentOriginal).toContain('<script>');
    expect(entry.publishedAt?.toISOString()).toBe('2026-05-28T10:00:00.000Z');
    expect(entry.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.sourceName).toBe('OpenAI · Newsroom');
  });

  it('detects Arabic source language', () => {
    const entry = normalizeEntry(makeSource(), {
      title: 'إطلاق نموذج جديد للذكاء الاصطناعي',
      url: 'https://openai.com/news/ar',
      content: 'تفاصيل حول النموذج الجديد',
    });
    expect(entry.sourceLanguage).toBe('ar');
  });
});

describe('sourceName', () => {
  it('omits the separator when there is no product', () => {
    expect(sourceName(makeSource({ product: null }))).toBe('OpenAI');
  });
});

describe('decideOutcome', () => {
  it('publishes domain-verified, high-confidence items', () => {
    expect(
      decideOutcome({ domainVerified: true, classifyConfidence: 0.8, summaryConfidence: 0.9 }),
    ).toEqual({ status: 'published', verified: true });
  });

  it('publishes domain-verified mid-confidence items (terse GitHub releases etc.)', () => {
    // Pre-relaxation these would have been parked in needs_review forever;
    // domain trust is the actual floor, so mid-confidence is fine.
    expect(
      decideOutcome({ domainVerified: true, classifyConfidence: 0.3, summaryConfidence: 0.35 }),
    ).toEqual({ status: 'published', verified: true });
  });

  it('routes truly-low-confidence summaries to needs_review (still verified)', () => {
    // Threshold floor is 0.25; below that we treat the LLM as genuinely confused.
    expect(
      decideOutcome({ domainVerified: true, classifyConfidence: 0.8, summaryConfidence: 0.1 }),
    ).toEqual({ status: 'needs_review', verified: true });
  });

  it('never verifies or publishes off-domain items', () => {
    expect(
      decideOutcome({ domainVerified: false, classifyConfidence: 0.9, summaryConfidence: 0.9 }),
    ).toEqual({ status: 'needs_review', verified: false });
  });
});
