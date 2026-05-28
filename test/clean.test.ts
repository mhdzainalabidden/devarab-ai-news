import { describe, it, expect } from 'vitest';
import {
  htmlToText,
  normalizeTitle,
  detectLanguage,
  parseDate,
  truncate,
} from '../src/ingestion/clean';

describe('htmlToText', () => {
  it('strips tags and scripts, keeping readable text', () => {
    const html = '<div><h1>Title</h1><script>evil()</script><p>Hello <b>world</b></p></div>';
    const text = htmlToText(html);
    expect(text).toContain('Title');
    expect(text).toContain('Hello world');
    expect(text).not.toContain('evil');
    expect(text).not.toContain('<');
  });

  it('passes through plain text', () => {
    expect(htmlToText('just plain text')).toBe('just plain text');
  });

  it('handles empty input', () => {
    expect(htmlToText('')).toBe('');
  });
});

describe('normalizeTitle', () => {
  it('collapses whitespace and newlines into single spaces', () => {
    expect(normalizeTitle('  New\n  Model   Released ')).toBe('New Model Released');
  });
});

describe('detectLanguage', () => {
  it('detects Arabic when Arabic script dominates', () => {
    expect(detectLanguage('أطلقت الشركة نموذجاً جديداً')).toBe('ar');
  });
  it('detects English otherwise', () => {
    expect(detectLanguage('OpenAI released a new model')).toBe('en');
  });
});

describe('parseDate', () => {
  it('parses ISO strings', () => {
    expect(parseDate('2026-01-15T10:00:00Z')?.toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });
  it('returns null for junk', () => {
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe('truncate', () => {
  it('does not touch short strings', () => {
    expect(truncate('short', 100)).toBe('short');
  });
  it('truncates long strings with an ellipsis', () => {
    const out = truncate('one two three four five six seven', 15);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(16);
  });
});
