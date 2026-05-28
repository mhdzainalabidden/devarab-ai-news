import RssParser from 'rss-parser';
import type { RawEntry, Source } from '../../types';
import { config } from '../../config';

const parser = new RssParser({
  timeout: config.http.timeoutMs,
  headers: { 'user-agent': config.http.userAgent },
});

/** Fetch and parse an RSS/Atom feed into raw entries. */
export async function fetchRss(source: Source, limit: number): Promise<RawEntry[]> {
  const feed = await parser.parseURL(source.source_url);
  const items = (feed.items ?? []).slice(0, limit);
  return items
    .map((item): RawEntry | null => {
      const url = item.link ?? item.guid ?? '';
      const title = (item.title ?? '').trim();
      if (!url || !title) return null;
      const content =
        item['content:encoded'] ??
        (item as { content?: string }).content ??
        item.contentSnippet ??
        item.summary ??
        title;
      return {
        title,
        url,
        content: String(content ?? ''),
        publishedAt: item.isoDate ?? item.pubDate ?? null,
      };
    })
    .filter((e): e is RawEntry => e !== null);
}
