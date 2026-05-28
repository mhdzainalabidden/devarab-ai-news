import { describe, it, expect } from 'vitest';
import { serializeNewsItem, buildDigest, parseLang } from '../src/api/serialize';
import { makeNewsItem } from './fixtures';

describe('parseLang', () => {
  it('defaults to both', () => expect(parseLang('xx')).toBe('both'));
  it('passes valid values', () => {
    expect(parseLang('ar')).toBe('ar');
    expect(parseLang('en')).toBe('en');
  });
});

describe('serializeNewsItem', () => {
  it('includes all required fields', () => {
    const out = serializeNewsItem(makeNewsItem(), 'both');
    for (const key of [
      'id', 'company', 'product', 'category', 'impact_level', 'verified',
      'title_ar', 'summary_ar', 'title_en', 'summary_en', 'tags',
      'official_source_url', 'source_name', 'published_at', 'detected_at',
    ]) {
      expect(out).toHaveProperty(key);
    }
    expect(out.detected_at).toBe('2026-05-28T10:05:00.000Z');
  });

  it('nulls English fields when lang=ar', () => {
    const out = serializeNewsItem(makeNewsItem(), 'ar');
    expect(out.title_ar).not.toBeNull();
    expect(out.title_en).toBeNull();
    expect(out.summary_en).toBeNull();
  });

  it('nulls Arabic fields when lang=en', () => {
    const out = serializeNewsItem(makeNewsItem(), 'en');
    expect(out.title_en).not.toBeNull();
    expect(out.title_ar).toBeNull();
  });
});

describe('buildDigest', () => {
  it('groups by company then category, sorted by volume', () => {
    const items = [
      makeNewsItem({ id: 1, company: 'OpenAI', category: 'model' }),
      makeNewsItem({ id: 2, company: 'OpenAI', category: 'model' }),
      makeNewsItem({ id: 3, company: 'OpenAI', category: 'pricing' }),
      makeNewsItem({ id: 4, company: 'Anthropic', category: 'security' }),
    ];
    const groups = buildDigest(items, 'both');
    expect(groups[0]!.company).toBe('OpenAI');
    expect(groups[0]!.total).toBe(3);
    expect(groups[0]!.categories[0]!.category).toBe('model');
    expect(groups[0]!.categories[0]!.count).toBe(2);
    expect(groups[1]!.company).toBe('Anthropic');
  });
});
