import type { RawEntry, Source } from '../../types';
import { fetchRss } from './rss.fetcher';
import { fetchHtml } from './html.fetcher';
import { fetchGithub } from './github.fetcher';
import { fetchPlaywright } from './playwright.fetcher';

export type FetcherFn = (source: Source, limit: number) => Promise<RawEntry[]>;

const FETCHERS: Record<Source['source_type'], FetcherFn> = {
  rss: fetchRss,
  html: fetchHtml,
  github: fetchGithub,
  playwright: fetchPlaywright,
};

/** Dispatch to the correct fetcher for a source's type. */
export function fetchSource(source: Source, limit: number): Promise<RawEntry[]> {
  const fn = FETCHERS[source.source_type];
  if (!fn) throw new Error(`no fetcher for source_type '${source.source_type}'`);
  return fn(source, limit);
}

export { fetchRss, fetchHtml, fetchGithub, fetchPlaywright };
