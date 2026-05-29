import { describe, it, expect } from 'vitest';
import { pickRssImage } from '../src/ingestion/fetchers/rss.fetcher';
import { parseHtmlListing } from '../src/ingestion/fetchers/html.fetcher';
import { cleanImageUrl } from '../src/ingestion/url';
import { serializeNewsItem } from '../src/api/serialize';
import { makeNewsItem } from './fixtures';

describe('pickRssImage', () => {
  it('prefers media:thumbnail', () => {
    expect(pickRssImage({ mediaThumbnail: [{ $: { url: 'https://x.com/t.jpg' } }] })).toBe(
      'https://x.com/t.jpg',
    );
  });
  it('falls back to media:content', () => {
    expect(pickRssImage({ mediaContent: { $: { url: 'https://x.com/c.png' } } })).toBe(
      'https://x.com/c.png',
    );
  });
  it('uses an image enclosure', () => {
    expect(pickRssImage({ enclosure: { url: 'https://x.com/e.jpg', type: 'image/jpeg' } })).toBe(
      'https://x.com/e.jpg',
    );
  });
  it('ignores a non-image enclosure', () => {
    expect(pickRssImage({ enclosure: { url: 'https://x.com/a.mp3', type: 'audio/mpeg' } })).toBeNull();
  });
  it('extracts the first <img> from content:encoded', () => {
    expect(
      pickRssImage({ 'content:encoded': '<p>hi</p><img src="https://x.com/in.png"> more' }),
    ).toBe('https://x.com/in.png');
  });
  it('returns null when there is no image', () => {
    expect(pickRssImage({ title: 'no media here' })).toBeNull();
  });
});

describe('cleanImageUrl', () => {
  it('resolves relative against base and keeps query params', () => {
    expect(cleanImageUrl('/img/a.png?sig=abc', 'https://cdn.test/post')).toBe(
      'https://cdn.test/img/a.png?sig=abc',
    );
  });
  it('rejects data: URIs and non-http', () => {
    expect(cleanImageUrl('data:image/png;base64,xxxx', 'https://x.com')).toBeNull();
    expect(cleanImageUrl('ftp://x.com/a.png', 'https://x.com')).toBeNull();
  });
  it('returns null for empty', () => {
    expect(cleanImageUrl('', 'https://x.com')).toBeNull();
    expect(cleanImageUrl(null, 'https://x.com')).toBeNull();
  });
});

describe('parseHtmlListing image extraction', () => {
  it('reads img via imageSelector and resolves relative src', () => {
    const html =
      '<article><h2><a href="/p">Post</a></h2><img class="thumb" src="/t.jpg"></article>';
    const entries = parseHtmlListing(
      html,
      { itemSelector: 'article', titleSelector: 'h2', linkSelector: 'a', imageSelector: 'img.thumb' },
      'https://site.test',
    );
    expect(entries[0]!.imageUrl).toBe('https://site.test/t.jpg');
  });
  it('falls back to the first <img> when no imageSelector', () => {
    const html = '<article><h2><a href="/p">Post</a></h2><img src="https://cdn/x.png"></article>';
    const entries = parseHtmlListing(
      html,
      { itemSelector: 'article', titleSelector: 'h2', linkSelector: 'a' },
      'https://site.test',
    );
    expect(entries[0]!.imageUrl).toBe('https://cdn/x.png');
  });
});

describe('serializeNewsItem image_url', () => {
  it('includes image_url in the response', () => {
    const out = serializeNewsItem(makeNewsItem(), 'both');
    expect(out).toHaveProperty('image_url');
    expect(out.image_url).toBe('https://openai.com/img/new-model.png');
  });
});
