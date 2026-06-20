import { describe, it, expect } from 'vitest';
import {
  buildNewsListQuery,
  buildNewsCountQuery,
  resolveSince,
  clampLimit,
} from '../src/repositories/newsQuery';

describe('resolveSince', () => {
  const now = new Date('2026-05-28T12:00:00Z');
  it('resolves relative windows', () => {
    expect(resolveSince('24h', now)?.toISOString()).toBe('2026-05-27T12:00:00.000Z');
    expect(resolveSince('7d', now)?.toISOString()).toBe('2026-05-21T12:00:00.000Z');
    expect(resolveSince('30m', now)?.toISOString()).toBe('2026-05-28T11:30:00.000Z');
  });
  it('resolves ISO timestamps', () => {
    expect(resolveSince('2026-01-01T00:00:00Z')?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
  it('returns null for junk or zero', () => {
    expect(resolveSince('nonsense')).toBeNull();
    expect(resolveSince('0d', now)).toBeNull();
    expect(resolveSince(undefined)).toBeNull();
  });
});

describe('clampLimit', () => {
  it('defaults to 20', () => expect(clampLimit(undefined)).toBe(20));
  it('caps at 100', () => expect(clampLimit(9999)).toBe(100));
  it('floors at 1', () => expect(clampLimit(0)).toBe(1));
});

describe('buildNewsListQuery', () => {
  it('excludes ignored/duplicate by default and orders by detected_at desc', () => {
    const { sql } = buildNewsListQuery({});
    expect(sql).toContain("status NOT IN ('ignored','duplicate')");
    expect(sql).toContain('ORDER BY detected_at DESC');
  });

  it('binds all filters as parameters (no interpolation)', () => {
    const now = new Date('2026-05-28T12:00:00Z');
    const { sql, values } = buildNewsListQuery(
      {
        company: 'OpenAI',
        product: 'API',
        category: 'security',
        impact: 'critical',
        tag: 'cve',
        verified: true,
        since: '24h',
        limit: 5,
      },
      now,
    );
    expect(sql).toContain('lower(company) = lower($1)');
    expect(sql).toContain('$5 = ANY(tags)');
    expect(values).toContain('OpenAI');
    expect(values).toContain('security');
    expect(values).toContain('critical');
    expect(values).toContain('cve');
    expect(values).toContain(true);
    expect(values).toContain('2026-05-27T12:00:00.000Z');
    // limit clamped value present
    expect(values).toContain(5);
  });

  it('uses status=published when publishedOnly is set', () => {
    const { sql, values } = buildNewsListQuery({ publishedOnly: true });
    expect(sql).toContain('status = $1');
    expect(values[0]).toBe('published');
  });

  it('ignores invalid category/impact values', () => {
    const { sql } = buildNewsListQuery({ category: 'bogus' as never, impact: 'huge' as never });
    expect(sql).not.toContain('category =');
    expect(sql).not.toContain('impact_level =');
  });

  it('orders ascending when sort=oldest', () => {
    const { sql } = buildNewsListQuery({ sort: 'oldest' });
    expect(sql).toContain('ORDER BY detected_at ASC NULLS LAST, id ASC');
  });

  it('orders by published_at when date_field=published', () => {
    const { sql } = buildNewsListQuery({ dateField: 'published' });
    expect(sql).toContain('ORDER BY published_at DESC NULLS LAST, id DESC');
  });

  it('filters the selected date field for since and to (range)', () => {
    const now = new Date('2026-05-28T12:00:00Z');
    const { sql, values } = buildNewsListQuery(
      { dateField: 'published', since: '7d', to: '2026-05-27T00:00:00Z' },
      now,
    );
    expect(sql).toContain('published_at >=');
    expect(sql).toContain('published_at <=');
    expect(values).toContain('2026-05-21T12:00:00.000Z'); // now - 7d
    expect(values).toContain('2026-05-27T00:00:00.000Z'); // explicit `to`
  });

  it('treats from as an alias for since (from wins)', () => {
    const now = new Date('2026-05-28T12:00:00Z');
    const { values } = buildNewsListQuery({ since: '7d', from: '24h' }, now);
    expect(values).toContain('2026-05-27T12:00:00.000Z'); // now - 24h (from)
    expect(values).not.toContain('2026-05-21T12:00:00.000Z'); // not 7d
  });
});

describe('buildNewsCountQuery', () => {
  it('counts with the same WHERE but no order/limit/offset', () => {
    const { sql, values } = buildNewsCountQuery({ publishedOnly: true, company: 'OpenAI' });
    expect(sql).toContain('SELECT COUNT(*)::int AS total');
    expect(sql).not.toContain('ORDER BY');
    expect(sql).not.toContain('LIMIT');
    expect(sql).toContain('status = $1');
    expect(values).toContain('published');
    expect(values).toContain('OpenAI');
  });
});
