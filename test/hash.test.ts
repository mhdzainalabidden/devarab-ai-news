import { describe, it, expect } from 'vitest';
import { contentHash } from '../src/ingestion/hash';

describe('contentHash', () => {
  it('is stable for identical canonical inputs', () => {
    const a = contentHash('https://x.com/p', 'Title', 'Body text');
    const b = contentHash('https://x.com/p', 'Title', 'Body text');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('ignores tracking params + trailing slash in the URL (same item)', () => {
    const a = contentHash('https://x.com/p', 'Title', 'Body');
    const b = contentHash('https://x.com/p/?utm_source=tw', 'Title', 'Body');
    expect(a).toBe(b);
  });

  it('ignores whitespace and case differences in title/body', () => {
    const a = contentHash('https://x.com/p', 'Hello World', 'Some  body');
    const b = contentHash('https://x.com/p', '  hello   world ', 'some body');
    expect(a).toBe(b);
  });

  it('changes when the body materially changes', () => {
    const a = contentHash('https://x.com/p', 'Title', 'v1 of the release notes');
    const b = contentHash('https://x.com/p', 'Title', 'v2 of the release notes');
    expect(a).not.toBe(b);
  });

  it('changes when the URL points to a different document', () => {
    const a = contentHash('https://x.com/p1', 'Title', 'Body');
    const b = contentHash('https://x.com/p2', 'Title', 'Body');
    expect(a).not.toBe(b);
  });
});
