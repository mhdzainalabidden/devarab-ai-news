import { describe, it, expect, vi } from 'vitest';
import { runIngestion, type OrchestratorDeps } from '../src/ingestion/orchestrator';
import type { RawEntry, Source } from '../src/types';
import type { Enrichment } from '../src/llm/enrich';
import { makeSource } from './fixtures';
import type { InsertNewsInput } from '../src/repositories/newsItems.repo';

interface Harness {
  deps: Partial<OrchestratorDeps>;
  inserts: InsertNewsInput[];
  marked: { id: number; success: boolean }[];
  enrichCalls: number;
  finished: { id: number; update: Record<string, unknown> }[];
}

function harness(opts: {
  sources: Source[];
  entriesBySource: Record<number, RawEntry[]>;
  robotsAllowed?: boolean;
  fetchThrows?: boolean;
}): Harness {
  const seen = new Set<string>();
  const inserts: InsertNewsInput[] = [];
  const marked: { id: number; success: boolean }[] = [];
  const finished: { id: number; update: Record<string, unknown> }[] = [];
  const state = { enrichCalls: 0 };

  const enrich = vi.fn(async (input: { title: string }): Promise<Enrichment> => {
    state.enrichCalls += 1;
    const low = input.title.toLowerCase().includes('low');
    return {
      category: 'model',
      tags: ['gpt'],
      impact: 'high',
      title_ar: 'عنوان',
      summary_ar: 'ملخص',
      title_en: input.title,
      summary_en: 'summary',
      confidence: low ? 0.2 : 0.9,
    };
  });

  const deps: Partial<OrchestratorDeps> = {
    now: () => new Date('2026-05-28T12:00:00Z'),
    listSources: async () => opts.sources,
    findDueSources: async () => opts.sources,
    markChecked: async (id, success) => {
      marked.push({ id, success });
    },
    existsByHash: async (hash) => seen.has(hash),
    insertNews: async (input) => {
      if (seen.has(input.content_hash)) return null;
      seen.add(input.content_hash);
      inserts.push(input);
      return { id: inserts.length } as never;
    },
    fetchSource: async (source) => {
      if (opts.fetchThrows) throw new Error('boom');
      return opts.entriesBySource[source.id] ?? [];
    },
    enrich: enrich as unknown as OrchestratorDeps['enrich'],
    robots: { isAllowed: async () => opts.robotsAllowed ?? true },
    startJobRun: async () => 42,
    finishJobRun: async (id, update) => {
      finished.push({ id, update: update as Record<string, unknown> });
    },
  };

  return {
    deps,
    inserts,
    marked,
    finished,
    get enrichCalls() {
      return state.enrichCalls;
    },
  };
}

describe('runIngestion (full workflow)', () => {
  it('dedupes, verifies domains, enriches, and assigns status', async () => {
    const source = makeSource({ id: 1, official_domain: 'openai.com' });
    const a: RawEntry = {
      title: 'New flagship model',
      url: 'https://openai.com/news/a',
      content: '<p>We launched a model.</p>',
      publishedAt: '2026-05-28T10:00:00Z',
    };
    const entries: RawEntry[] = [
      a,
      { ...a }, // exact duplicate -> skipped
      { title: 'Leak rumor', url: 'https://evil.com/x', content: '<p>off domain</p>' }, // off-domain
      { title: 'low signal note', url: 'https://openai.com/news/d', content: '<p>tiny</p>' }, // low conf
    ];

    const h = harness({ sources: [source], entriesBySource: { 1: entries } });
    const result = await runIngestion({ force: true }, h.deps);

    expect(result.sourcesChecked).toBe(1);
    expect(result.itemsFound).toBe(4);
    expect(result.itemsInserted).toBe(3);
    expect(result.itemsSkipped).toBe(1);
    expect(result.errors).toBe(0);

    // One merged LLM call runs only for domain-verified, non-duplicate entries
    // (a + d), not the duplicate and not the off-domain link.
    expect(h.enrichCalls).toBe(2);

    const byUrl = Object.fromEntries(h.inserts.map((i) => [i.official_source_url, i]));
    expect(byUrl['https://openai.com/news/a']).toMatchObject({
      status: 'published',
      verified: true,
      category: 'model',
      impact_level: 'high',
    });
    expect(byUrl['https://evil.com/x']).toMatchObject({
      status: 'needs_review',
      verified: false,
      category: null,
    });
    expect(byUrl['https://openai.com/news/d']).toMatchObject({
      status: 'needs_review',
      verified: true,
    });

    expect(h.marked).toEqual([{ id: 1, success: true }]);
    expect(h.finished[0]!.update).toMatchObject({
      status: 'success',
      sources_checked: 1,
      items_found: 4,
      items_inserted: 3,
      items_skipped: 1,
      errors: 0,
    });
  });

  it('skips sources disallowed by robots.txt without fetching', async () => {
    const source = makeSource({ id: 2, source_type: 'rss' });
    const h = harness({
      sources: [source],
      entriesBySource: { 2: [{ title: 'x', url: 'https://openai.com/x', content: 'y' }] },
      robotsAllowed: false,
    });
    const result = await runIngestion({ force: true }, h.deps);
    expect(result.itemsFound).toBe(0);
    expect(result.itemsInserted).toBe(0);
    expect(h.inserts.length).toBe(0);
    expect(h.marked).toEqual([{ id: 2, success: true }]);
    expect(result.perSource[0]!.error).toBe('disallowed-by-robots');
  });

  it('records a failure and marks the source unsuccessful when fetching throws', async () => {
    const source = makeSource({ id: 3 });
    const h = harness({ sources: [source], entriesBySource: {}, fetchThrows: true });
    const result = await runIngestion({ force: true }, h.deps);
    expect(result.errors).toBe(1);
    expect(h.marked).toEqual([{ id: 3, success: false }]);
    expect(h.finished[0]!.update.status).toBe('failed');
  });
});
