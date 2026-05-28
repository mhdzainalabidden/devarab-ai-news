import { describe, it, expect } from 'vitest';
import {
  canonicalizeUrl,
  verifyOfficialDomain,
  normalizeHost,
  resolveUrl,
} from '../src/ingestion/url';

describe('canonicalizeUrl', () => {
  it('lowercases scheme + host and drops the fragment', () => {
    expect(canonicalizeUrl('HTTPS://OpenAI.com/News#section')).toBe('https://openai.com/News');
  });

  it('strips tracking params and sorts the rest', () => {
    expect(canonicalizeUrl('https://x.com/p?utm_source=tw&b=2&a=1&fbclid=zzz')).toBe(
      'https://x.com/p?a=1&b=2',
    );
  });

  it('removes default ports and a trailing slash', () => {
    expect(canonicalizeUrl('https://x.com:443/post/')).toBe('https://x.com/post');
  });

  it('keeps the root slash', () => {
    expect(canonicalizeUrl('https://x.com/')).toBe('https://x.com/');
  });

  it('returns input unchanged when unparseable', () => {
    expect(canonicalizeUrl('not a url')).toBe('not a url');
  });
});

describe('normalizeHost', () => {
  it('drops www and trailing dot', () => {
    expect(normalizeHost('www.OpenAI.com.')).toBe('openai.com');
  });
});

describe('verifyOfficialDomain', () => {
  it('accepts the apex domain', () => {
    expect(verifyOfficialDomain('https://openai.com/news/x', 'openai.com')).toBe(true);
  });
  it('accepts www and subdomains', () => {
    expect(verifyOfficialDomain('https://www.openai.com/x', 'openai.com')).toBe(true);
    expect(verifyOfficialDomain('https://help.openai.com/x', 'openai.com')).toBe(true);
  });
  it('rejects lookalike and suffix-attack domains', () => {
    expect(verifyOfficialDomain('https://notopenai.com/x', 'openai.com')).toBe(false);
    expect(verifyOfficialDomain('https://openai.com.evil.com/x', 'openai.com')).toBe(false);
  });
  it('rejects unrelated domains', () => {
    expect(verifyOfficialDomain('https://medium.com/@someone/openai', 'openai.com')).toBe(false);
  });
  it('matches subdomain official_domain like ai.meta.com via meta.com', () => {
    expect(verifyOfficialDomain('https://ai.meta.com/blog/x', 'meta.com')).toBe(true);
  });
  it('returns false for garbage urls', () => {
    expect(verifyOfficialDomain('::::', 'openai.com')).toBe(false);
  });
});

describe('resolveUrl', () => {
  it('resolves relative hrefs against a base', () => {
    expect(resolveUrl('/news/x', 'https://openai.com/blog')).toBe('https://openai.com/news/x');
  });
  it('returns null on failure', () => {
    expect(resolveUrl('/x', 'not a base')).toBeNull();
  });
});
