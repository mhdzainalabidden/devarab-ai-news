import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../deps';
import { CATEGORIES, IMPACT_LEVELS, type Category, type ImpactLevel } from '../../types';
import { parseLang, serializeNewsItem, buildDigest } from '../serialize';
import {
  resolveSince,
  clampLimit,
  type DateField,
  type SortOrder,
} from '../../repositories/newsQuery';

function asString(v: unknown): string | undefined {
  if (Array.isArray(v)) v = v[0];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

function asCategory(v: unknown): Category | undefined {
  const s = asString(v);
  return s && (CATEGORIES as readonly string[]).includes(s) ? (s as Category) : undefined;
}

function asImpact(v: unknown): ImpactLevel | undefined {
  const s = asString(v);
  return s && (IMPACT_LEVELS as readonly string[]).includes(s) ? (s as ImpactLevel) : undefined;
}

function asBool(v: unknown): boolean | undefined {
  const s = asString(v);
  if (s === undefined) return undefined;
  return ['1', 'true', 'yes'].includes(s.toLowerCase());
}

function asInt(v: unknown): number | undefined {
  const s = asString(v);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function asSort(v: unknown): SortOrder | undefined {
  const s = asString(v)?.toLowerCase();
  return s === 'oldest' || s === 'recent' ? s : undefined;
}

function asDateField(v: unknown): DateField | undefined {
  const s = asString(v)?.toLowerCase();
  return s === 'published' || s === 'detected' ? s : undefined;
}

export function registerNewsRoutes(app: FastifyInstance, deps: ApiDeps): void {
  // GET /api/ai-news — public feed with filters + pagination.
  // Ordering: defaults to newest-first on the selected date field; `sort=oldest`
  // flips it. Date field: `date_field=detected` (default — ingest time, "what's
  // new in the feed") or `date_field=published` (article publication date);
  // `since`/`from`/`to`/`window` all filter on that field. Status: `status=published`
  // restricts to published rows (internal statuses are never exposed).
  app.get('/api/ai-news', async (req) => {
    const q = req.query as Record<string, unknown>;
    const lang = parseLang(asString(q.lang));

    // Resolve pagination once so the response can echo the clamped values.
    const limit = clampLimit(asInt(q.limit));
    const offset = Math.max(0, Math.floor(asInt(q.offset) ?? 0));

    const filters = {
      company: asString(q.company),
      product: asString(q.product),
      category: asCategory(q.category),
      impact: asImpact(q.impact),
      tag: asString(q.tag),
      // `window` is an alias for `since` (relative window); `from`/`to` bound a range.
      since: asString(q.since) ?? asString(q.window),
      from: asString(q.from),
      to: asString(q.to),
      dateField: asDateField(q.date_field),
      sort: asSort(q.sort),
      verified: asBool(q.verified),
      // Only `published` is honored publicly; other statuses stay internal.
      publishedOnly: asString(q.status)?.toLowerCase() === 'published' || undefined,
      limit,
      offset,
    };

    const [items, total] = await Promise.all([deps.listNews(filters), deps.countNews(filters)]);
    const hasMore = offset + items.length < total;

    return {
      lang,
      count: items.length,
      total,
      limit,
      offset,
      has_more: hasMore,
      next_offset: hasMore ? offset + items.length : null,
      items: items.map((i) => serializeNewsItem(i, lang)),
    };
  });

  // GET /api/ai-news/latest — verified, published news only.
  app.get('/api/ai-news/latest', async (req) => {
    const q = req.query as Record<string, unknown>;
    const lang = parseLang(asString(q.lang));
    const items = await deps.listNews({
      verified: true,
      publishedOnly: true,
      company: asString(q.company),
      category: asCategory(q.category),
      limit: asInt(q.limit),
    });
    return {
      lang,
      count: items.length,
      items: items.map((i) => serializeNewsItem(i, lang)),
    };
  });

  // GET /api/ai-news/digest — grouped by company/category over a time window.
  app.get('/api/ai-news/digest', async (req) => {
    const q = req.query as Record<string, unknown>;
    const lang = parseLang(asString(q.lang));
    const windowRaw = (asString(q.window) ?? '24h').toLowerCase();
    const window = windowRaw === '7d' ? '7d' : windowRaw === '24h' ? '24h' : '24h';
    const since = resolveSince(window) ?? new Date(Date.now() - 24 * 3600_000);
    const items = await deps.digestItems(since.toISOString());
    return {
      lang,
      window,
      since: since.toISOString(),
      total: items.length,
      groups: buildDigest(items, lang),
    };
  });

  // GET /api/ai-news/companies — tracked companies + source health.
  app.get('/api/ai-news/companies', async () => {
    const companies = await deps.companiesOverview();
    return {
      count: companies.length,
      companies: companies.map((c) => ({
        company: c.company,
        products: c.products,
        active_sources: c.active_sources,
        total_sources: c.total_sources,
        last_checked_at: c.last_checked_at ? new Date(c.last_checked_at).toISOString() : null,
        last_detected_at: c.last_detected_at ? new Date(c.last_detected_at).toISOString() : null,
        last_item_title: c.last_item_title,
      })),
    };
  });

  // GET /api/ai-news/:id — one item with metadata.
  app.get('/api/ai-news/:id', async (req, reply) => {
    const params = req.params as { id: string };
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'invalid id' });
    }
    const item = await deps.getNewsById(id);
    if (!item) return reply.code(404).send({ error: 'not found' });
    const lang = parseLang(asString((req.query as Record<string, unknown>).lang));
    return {
      ...serializeNewsItem(item, lang),
      // Extra metadata available on the single-item view.
      content_hash: item.content_hash,
      source_id: item.source_id,
      created_at: item.created_at ? new Date(item.created_at).toISOString() : null,
      updated_at: item.updated_at ? new Date(item.updated_at).toISOString() : null,
    };
  });
}
