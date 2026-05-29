import RssParser from 'rss-parser';
import type { RawEntry, Source } from '../../types';
import { config } from '../../config';

const parser = new RssParser({
  timeout: config.http.timeoutMs,
  headers: { 'user-agent': config.http.userAgent },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
    ],
  },
});

/** Pull a URL out of a media:* node which may be a string, {url}, {$:{url}}, or an array. */
function attrUrl(node: unknown): string | null {
  if (!node) return null;
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    for (const n of node) {
      const u = attrUrl(n);
      if (u) return u;
    }
    return null;
  }
  const obj = node as { url?: string; $?: { url?: string } };
  return obj.$?.url ?? obj.url ?? null;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i;

/** Best-effort image URL from an RSS/Atom item, using only data already in the feed. */
export function pickRssImage(item: Record<string, unknown>): string | null {
  const thumb = attrUrl(item.mediaThumbnail ?? (item as Record<string, unknown>)['media:thumbnail']);
  if (thumb) return thumb;

  const media = attrUrl(item.mediaContent ?? (item as Record<string, unknown>)['media:content']);
  if (media) return media;

  const enc = item.enclosure as { url?: string; type?: string } | undefined;
  if (enc?.url && (/^image\//i.test(enc.type ?? '') || IMAGE_EXT.test(enc.url))) {
    return enc.url;
  }

  const html = (item['content:encoded'] ?? item.content ?? '') as string;
  if (typeof html === 'string') {
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) return m[1] ?? null;
  }
  return null;
}

/** Fetch and parse an RSS/Atom feed into raw entries. */
export async function fetchRss(source: Source, limit: number): Promise<RawEntry[]> {
  const feed = await parser.parseURL(source.source_url);
  const items = (feed.items ?? []).slice(0, limit);
  return items
    .map((item): RawEntry | null => {
      const rec = item as unknown as Record<string, unknown>;
      const url = String(rec.link ?? rec.guid ?? '');
      const title = String(rec.title ?? '').trim();
      if (!url || !title) return null;
      const content =
        rec['content:encoded'] ?? rec.content ?? rec.contentSnippet ?? rec.summary ?? title;
      return {
        title,
        url,
        content: String(content ?? ''),
        publishedAt: (rec.isoDate as string) ?? (rec.pubDate as string) ?? null,
        imageUrl: pickRssImage(rec),
      };
    })
    .filter((e): e is RawEntry => e !== null);
}
