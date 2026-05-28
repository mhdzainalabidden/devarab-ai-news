import { describe, it, expect } from 'vitest';
import { parseHtmlListing } from '../src/ingestion/fetchers/html.fetcher';

const HTML = `
<html><body>
  <main>
    <article>
      <h2><a href="/changelog/v2">Version 2.0 released</a></h2>
      <time datetime="2026-05-20">May 20, 2026</time>
      <p>We shipped a new API and SDK.</p>
    </article>
    <article>
      <h2><a href="https://cursor.com/changelog/v1">Version 1.9</a></h2>
      <time datetime="2026-05-10">May 10, 2026</time>
      <p>Bug fixes and improvements.</p>
    </article>
    <article>
      <!-- malformed: no link -->
      <h2>Draft entry</h2>
    </article>
  </main>
</body></html>`;

describe('parseHtmlListing', () => {
  it('extracts entries with resolved absolute URLs', () => {
    const entries = parseHtmlListing(
      HTML,
      {
        itemSelector: 'article',
        titleSelector: 'h2',
        linkSelector: 'a',
        dateSelector: 'time',
        contentSelector: 'p',
      },
      'https://cursor.com/changelog',
    );
    expect(entries.length).toBe(2); // the link-less article is skipped
    expect(entries[0]).toMatchObject({
      title: 'Version 2.0 released',
      url: 'https://cursor.com/changelog/v2',
      publishedAt: '2026-05-20',
    });
    expect(entries[0]!.content).toContain('new API and SDK');
    expect(entries[1]!.url).toBe('https://cursor.com/changelog/v1');
  });

  it('uses a custom base URL when provided', () => {
    const entries = parseHtmlListing(
      '<article><h2><a href="/p">Post</a></h2></article>',
      { itemSelector: 'article', titleSelector: 'h2', linkSelector: 'a', baseUrl: 'https://example.org' },
      'https://fallback.test',
    );
    expect(entries[0]!.url).toBe('https://example.org/p');
  });
});
