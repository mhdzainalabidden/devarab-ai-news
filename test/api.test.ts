import { describe, it, expect, vi } from 'vitest';
import { buildServer } from '../src/api/server';
import type { ApiDeps } from '../src/api/deps';
import type { NewsListFilters } from '../src/repositories/newsQuery';
import { makeNewsItem } from './fixtures';

function fakeDeps(over: Partial<ApiDeps> = {}): ApiDeps {
  return {
    listNews: vi.fn(async () => [makeNewsItem()]),
    countNews: vi.fn(async () => 1),
    getNewsById: vi.fn(async (id: number) => (id === 1 ? makeNewsItem() : null)),
    digestItems: vi.fn(async () => [
      makeNewsItem({ id: 1, company: 'OpenAI', category: 'model' }),
      makeNewsItem({ id: 2, company: 'Anthropic', category: 'security' }),
    ]),
    companiesOverview: vi.fn(async () => [
      {
        company: 'OpenAI',
        active_sources: 2,
        total_sources: 3,
        products: ['Newsroom'],
        last_checked_at: new Date('2026-05-28T11:00:00Z'),
        last_detected_at: new Date('2026-05-28T10:00:00Z'),
        last_item_title: 'New model',
      },
    ]),
    upsertSource: vi.fn(async (input) => ({ id: 99, ...input } as never)),
    runIngestion: vi.fn(async () => ({
      jobRunId: 1,
      sourcesChecked: 1,
      itemsFound: 0,
      itemsInserted: 0,
      itemsSkipped: 0,
      errors: 0,
      perSource: [],
    })),
    recentJobRuns: vi.fn(async () => []),
    latestJobRun: vi.fn(async () => null),
    ...over,
  };
}

describe('GET /api/ai-news', () => {
  it('parses filters and returns serialized items', async () => {
    const listNews = vi.fn(async (_f: NewsListFilters) => [makeNewsItem()]);
    const app = buildServer(fakeDeps({ listNews }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai-news?company=OpenAI&category=model&verified=true&limit=5&since=24h&lang=en',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(1);
    expect(body.lang).toBe('en');
    expect(body.items[0].title_ar).toBeNull(); // lang=en nulls Arabic
    expect(listNews).toHaveBeenCalledWith(
      expect.objectContaining({
        company: 'OpenAI',
        category: 'model',
        verified: true,
        limit: 5,
        since: '24h',
      }),
    );
    await app.close();
  });

  it('ignores an invalid category filter', async () => {
    const listNews = vi.fn(async () => []);
    const app = buildServer(fakeDeps({ listNews }));
    await app.inject({ method: 'GET', url: '/api/ai-news?category=bogus' });
    expect(listNews).toHaveBeenCalledWith(expect.objectContaining({ category: undefined }));
    await app.close();
  });

  it('maps status=published, sort, date_field, and window into filters', async () => {
    const listNews = vi.fn(async () => [makeNewsItem()]);
    const app = buildServer(fakeDeps({ listNews }));
    await app.inject({
      method: 'GET',
      url: '/api/ai-news?status=published&sort=oldest&date_field=published&window=7d',
    });
    expect(listNews).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedOnly: true,
        sort: 'oldest',
        dateField: 'published',
        since: '7d',
      }),
    );
    await app.close();
  });

  it('returns pagination metadata derived from total', async () => {
    const listNews = vi.fn(async () => [makeNewsItem({ id: 1 }), makeNewsItem({ id: 2 })]);
    const countNews = vi.fn(async () => 5);
    const app = buildServer(fakeDeps({ listNews, countNews }));
    const res = await app.inject({ method: 'GET', url: '/api/ai-news?limit=2&offset=0' });
    const body = res.json();
    expect(body.total).toBe(5);
    expect(body.count).toBe(2);
    expect(body.limit).toBe(2);
    expect(body.has_more).toBe(true);
    expect(body.next_offset).toBe(2);
    await app.close();
  });

  it('reports has_more=false on the last page', async () => {
    const listNews = vi.fn(async () => [makeNewsItem({ id: 5 })]);
    const countNews = vi.fn(async () => 5);
    const app = buildServer(fakeDeps({ listNews, countNews }));
    const res = await app.inject({ method: 'GET', url: '/api/ai-news?limit=2&offset=4' });
    const body = res.json();
    expect(body.has_more).toBe(false);
    expect(body.next_offset).toBeNull();
    await app.close();
  });
});

describe('GET /api/ai-news/latest', () => {
  it('forces verified + publishedOnly', async () => {
    const listNews = vi.fn(async () => [makeNewsItem()]);
    const app = buildServer(fakeDeps({ listNews }));
    const res = await app.inject({ method: 'GET', url: '/api/ai-news/latest' });
    expect(res.statusCode).toBe(200);
    expect(listNews).toHaveBeenCalledWith(
      expect.objectContaining({ verified: true, publishedOnly: true }),
    );
    await app.close();
  });
});

describe('GET /api/ai-news/:id', () => {
  it('returns 200 with metadata for an existing item', async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: 'GET', url: '/api/ai-news/1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('content_hash');
    await app.close();
  });
  it('returns 404 when missing', async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: 'GET', url: '/api/ai-news/2' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
  it('returns 400 for a non-numeric id', async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: 'GET', url: '/api/ai-news/abc' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /api/ai-news/digest', () => {
  it('returns groups for a window', async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: 'GET', url: '/api/ai-news/digest?window=7d' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.window).toBe('7d');
    expect(body.total).toBe(2);
    expect(body.groups.length).toBe(2);
    await app.close();
  });
});

describe('GET /api/ai-news/companies', () => {
  it('returns the companies overview', async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: 'GET', url: '/api/ai-news/companies' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.companies[0].company).toBe('OpenAI');
    expect(body.companies[0].active_sources).toBe(2);
    await app.close();
  });
});

describe('POST /api/admin/sources', () => {
  const validBody = {
    company: 'TestCo',
    source_url: 'https://testco.com/feed.xml',
    source_type: 'rss',
    official_domain: 'testco.com',
  };

  it('rejects without the admin key', async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: 'POST', url: '/api/admin/sources', payload: validBody });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('upserts with a valid key + body', async () => {
    const upsertSource = vi.fn(async (input) => ({ id: 99, ...input } as never));
    const app = buildServer(fakeDeps({ upsertSource }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/sources',
      headers: { 'x-admin-key': 'test-admin-key' },
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(upsertSource).toHaveBeenCalledOnce();
    await app.close();
  });

  it('returns 400 for an invalid body', async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/sources',
      headers: { 'x-admin-key': 'test-admin-key' },
      payload: { company: 'x' }, // missing required fields
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /api/admin/run-ingestion', () => {
  it('triggers ingestion with a valid key', async () => {
    const runIngestion = vi.fn(async () => ({
      jobRunId: 1,
      sourcesChecked: 2,
      itemsFound: 0,
      itemsInserted: 0,
      itemsSkipped: 0,
      errors: 0,
      perSource: [],
    }));
    const app = buildServer(fakeDeps({ runIngestion }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/run-ingestion',
      headers: { 'x-admin-key': 'test-admin-key' },
      payload: { force: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.sourcesChecked).toBe(2);
    expect(runIngestion).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    await app.close();
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = buildServer(fakeDeps());
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    await app.close();
  });
});

describe('CORS', () => {
  it('sets an access-control-allow-origin header for cross-origin GETs', async () => {
    const app = buildServer(fakeDeps());
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai-news?limit=1',
      headers: { origin: 'https://devarab.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
    await app.close();
  });

  it('answers CORS preflight (OPTIONS)', async () => {
    const app = buildServer(fakeDeps());
    await app.ready();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/ai-news',
      headers: {
        origin: 'https://devarab.com',
        'access-control-request-method': 'GET',
      },
    });
    expect([200, 204]).toContain(res.statusCode);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
    await app.close();
  });
});
