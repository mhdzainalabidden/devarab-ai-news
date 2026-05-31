import { describe, it, expect, afterEach } from 'vitest';
import { intEnv, buildTiers, AGE_EXPR } from '../src/scripts/purge-old';

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('purge-old: intEnv', () => {
  it('returns the default when the env var is unset', () => {
    delete process.env.RETENTION_LOW_DAYS;
    expect(intEnv('RETENTION_LOW_DAYS', 60)).toBe(60);
  });

  it('returns the default when the env var is empty', () => {
    process.env.RETENTION_LOW_DAYS = '';
    expect(intEnv('RETENTION_LOW_DAYS', 60)).toBe(60);
  });

  it('parses a valid positive integer', () => {
    process.env.RETENTION_LOW_DAYS = '30';
    expect(intEnv('RETENTION_LOW_DAYS', 60)).toBe(30);
  });

  it('falls back to the default for non-numeric values', () => {
    process.env.RETENTION_LOW_DAYS = 'forever';
    expect(intEnv('RETENTION_LOW_DAYS', 60)).toBe(60);
  });

  it('falls back to the default for zero or negative values (window must be positive)', () => {
    process.env.RETENTION_LOW_DAYS = '0';
    expect(intEnv('RETENTION_LOW_DAYS', 60)).toBe(60);
    process.env.RETENTION_LOW_DAYS = '-5';
    expect(intEnv('RETENTION_LOW_DAYS', 60)).toBe(60);
  });

  it('floors fractional values', () => {
    process.env.RETENTION_LOW_DAYS = '45.7';
    expect(intEnv('RETENTION_LOW_DAYS', 60)).toBe(45);
  });
});

describe('purge-old: buildTiers', () => {
  it('returns the four standard tiers in the expected order', () => {
    delete process.env.RETENTION_IGNORED_DAYS;
    delete process.env.RETENTION_LOW_DAYS;
    delete process.env.RETENTION_MEDIUM_DAYS;
    delete process.env.RETENTION_HIGH_DAYS;

    const tiers = buildTiers();
    expect(tiers.map((t) => t.name)).toEqual([
      'ignored/duplicate',
      'low impact',
      'medium impact',
      'high impact',
    ]);
    expect(tiers.map((t) => t.days)).toEqual([14, 60, 180, 365]);
  });

  it('honors env overrides for each window', () => {
    process.env.RETENTION_IGNORED_DAYS = '7';
    process.env.RETENTION_LOW_DAYS = '30';
    process.env.RETENTION_MEDIUM_DAYS = '90';
    process.env.RETENTION_HIGH_DAYS = '730';

    const tiers = buildTiers();
    expect(tiers.map((t) => t.days)).toEqual([7, 30, 90, 730]);
  });

  it('never includes a tier that touches impact_level=critical', () => {
    const tiers = buildTiers();
    for (const t of tiers) {
      // The non-junk tiers explicitly target one specific impact level; the
      // junk tier targets a status set that excludes the impact_level column.
      // Either way, no WHERE clause should ever match critical rows.
      expect(t.where).not.toMatch(/critical/);
    }
  });

  it('uses a published_at-then-detected_at age basis', () => {
    expect(AGE_EXPR).toBe('coalesce(published_at, detected_at)');
  });
});
