import * as cheerio from 'cheerio';
import type { RawEntry, Source, HtmlFetchConfig } from '../../types';
import { fetchText } from '../http';
import { resolveUrl } from '../url';

/**
 * Pure HTML parser: extract raw entries from a page given a selector config.
 * Separated from fetching so it is unit-testable with fixture HTML.
 */
export function parseHtmlListing(
  html: string,
  cfg: HtmlFetchConfig,
  baseUrl: string,
): RawEntry[] {
  const $ = cheerio.load(html);
  const base = cfg.baseUrl ?? baseUrl;
  const out: RawEntry[] = [];

  $(cfg.itemSelector).each((_, el) => {
    const item = $(el);

    const titleEl = cfg.titleSelector ? item.find(cfg.titleSelector).first() : item;
    const title = titleEl.text().replace(/\s+/g, ' ').trim();

    const linkEl = cfg.linkSelector ? item.find(cfg.linkSelector).first() : item.find('a').first();
    const rawHref =
      linkEl.attr(cfg.linkAttr ?? 'href') ??
      (item.is('a') ? item.attr('href') : undefined) ??
      '';
    const url = rawHref ? resolveUrl(rawHref, base) : null;

    if (!title || !url) return;

    let publishedAt: string | null = null;
    if (cfg.dateSelector) {
      const dateEl = item.find(cfg.dateSelector).first();
      publishedAt = dateEl.attr('datetime') ?? dateEl.text().trim() ?? null;
    }

    const content = cfg.contentSelector
      ? item.find(cfg.contentSelector).first().text().trim() || title
      : item.text().replace(/\s+/g, ' ').trim();

    out.push({ title, url, content, publishedAt });
  });

  return out;
}

export async function fetchHtml(source: Source, limit: number): Promise<RawEntry[]> {
  const cfg = source.extra?.html;
  if (!cfg) {
    throw new Error(`source ${source.id} (${source.source_url}) is type 'html' but has no extra.html config`);
  }
  const res = await fetchText(source.source_url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${source.source_url}`);
  }
  const entries = parseHtmlListing(res.text, cfg, res.finalUrl);
  return entries.slice(0, limit);
}
