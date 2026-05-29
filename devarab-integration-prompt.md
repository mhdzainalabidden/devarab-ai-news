# Prompt — integrate the Dev Arab AI News API into the devArab web app

> Paste everything below the line into a Claude Code session opened in
> `C:\Users\mhdza\Desktop\devArab`.

---

## Goal

Integrate our **Dev Arab AI News API** (a separate backend service) into this
devArab web app so the site can display **verified, Arabic-first AI product
news**. Build the data client, pages, and components. Do **not** rebuild the
news engine — it already exists and exposes JSON.

## What the news API is

A standalone Node/Fastify service (repo `github.com/mhdzainalabidden/devarab-ai-news`)
that tracks official AI sources (OpenAI, Anthropic, Google/Gemini, Vercel,
Mistral, Hugging Face, Cursor, GitHub Copilot, etc.), verifies each item against
the source's official domain, and stores **Arabic-first** summaries (with a
secondary English summary). Data lives in Supabase; ingestion runs on a
schedule. It only exposes JSON — no UI.

- **Base URL (local dev):** `http://127.0.0.1:4010`
- **Production:** the API will be hosted separately; read its base URL from an
  env var, never hardcode it.

## Connection rules (important)

1. **Fetch server-side, not from the browser.** The API currently sends **no
   CORS headers**, so client-side `fetch()` from the browser will be blocked.
   Use App Router **Server Components**, **Route Handlers**, or **server
   actions** to call it. This also lets you cache responses. (If a client-side
   call is unavoidable, proxy it through a Next.js Route Handler.)
2. **Only use the GET endpoints.** The `POST /api/admin/*` endpoints are
   admin-only (require an `x-admin-key` header) — never call them from the app
   or expose that key to the browser.
3. **Add an env var** `AI_NEWS_API_BASE_URL` (e.g. `http://127.0.0.1:4010` in
   `.env.local`). All requests go through it.
4. **Cache + revalidate:** news refreshes roughly every 15 minutes. Use
   `fetch(url, { next: { revalidate: 600 } })` (10 min) or equivalent ISR.

## Endpoints to consume

| Endpoint | Use for |
|---|---|
| `GET /api/ai-news/latest?lang=ar&limit=20&company=&category=` | **Primary public feed** — returns only `verified` + `published` items. Use this for the main news list. |
| `GET /api/ai-news/:id?lang=ar` | Article **detail** page (adds `content_hash`, `source_id`, timestamps). |
| `GET /api/ai-news/digest?lang=ar&window=24h` (or `7d`) | A **digest** grouped by company → category. |
| `GET /api/ai-news/companies` | A **"tracked companies"** page (counts + last update per company). |
| `GET /api/ai-news?lang=ar&limit=20&offset=0&company=&product=&category=&tag=&impact=&since=24h&verified=true` | **Filtered/browse** list with pagination. NOTE: this can include items still pending review — pass `verified=true` and treat non-`published` `status` as not-for-display, or prefer `/latest` for public pages. |

**Query params:** `lang` = `ar` \| `en` \| `both` (default `both`; for the
public site use `ar`). `limit` 1–100 (default 20). `category` ∈ `model, api,
coding, security, pricing, research, tool, sdk, product, company, deprecation`.
`impact` ∈ `low, medium, high, critical`. `since` = `24h` \| `7d` \| `30m` \|
ISO timestamp. `tag` matches one of an item's tags.

## Response shapes

List endpoints (`/latest`, `/api/ai-news`):
```json
{ "lang": "ar", "count": 1, "items": [ /* news items */ ] }
```

A **news item**:
```json
{
  "id": 145,
  "company": "Vercel",
  "product": "Changelog",
  "category": "product",
  "impact_level": "medium",
  "verified": true,
  "title_ar": "توفر Qwen 3.7 Max من Alibaba على Vercel AI Gateway",
  "summary_ar": "أصبح نموذج Qwen 3.7 Max ... متاحًا الآن عبر Vercel AI Gateway.",
  "title_en": "Qwen 3.7 Max now available on Vercel AI Gateway",
  "summary_en": "Alibaba's Qwen 3.7 Max ... is now accessible via Vercel AI Gateway.",
  "tags": ["qwen", "vercel", "ai gateway"],
  "official_source_url": "https://vercel.com/changelog/qwen-3-7-max-...",
  "image_url": "https://.../thumbnail.webp",
  "source_name": "Vercel · Changelog",
  "source_language": "en",
  "status": "published",
  "published_at": "2026-05-21T07:00:00.000Z",
  "detected_at": "2026-05-28T09:57:11.305Z"
}
```
- `image_url` **may be `null`** (not every source provides an image) — always
  render a fallback/placeholder.
- When `lang=ar`, the English fields come back `null` (and vice-versa); with
  `both`, all four are populated.

`GET /api/ai-news/digest` →
```json
{ "lang":"ar","window":"24h","since":"...","total":12,
  "groups":[ { "company":"OpenAI","total":3,
    "categories":[ { "category":"model","count":2,"items":[ /* items */ ] } ] } ] }
```

`GET /api/ai-news/companies` →
```json
{ "count": 15, "companies": [
  { "company":"OpenAI","products":["Newsroom"],"active_sources":2,
    "total_sources":3,"last_checked_at":"...","last_detected_at":"...",
    "last_item_title":"..." } ] }
```

## What to build in this app

1. **API client** (`lib/ai-news.ts`): a small typed module with `getLatest()`,
   `getById(id)`, `getDigest(window)`, `getCompanies()`, `listNews(filters)` —
   all server-side, reading `AI_NEWS_API_BASE_URL`, with `revalidate`, and
   graceful error handling (return empty list / null on failure, never throw to
   the page). Define a `NewsItem` TypeScript type matching the shape above.
2. **News list page** (e.g. `/ai-news` or wherever fits the site IA): renders
   `getLatest({ lang: 'ar', limit })`, with category/company filter chips
   (client filters or query params) and "load more"/pagination.
3. **Article detail page** (`/ai-news/[id]`): `getById`, showing the Arabic
   title + summary, image (with fallback), impact + category badges, a
   **"verified" badge**, the `source_name`, a **"المصدر الرسمي" link** to
   `official_source_url` (open in new tab, `rel="noopener noreferrer"`), and the
   published date (format for Arabic locale).
4. **`NewsCard` component**: image (fallback if null), `title_ar`,
   `summary_ar` (clamped), category + impact badges, source + relative date.
5. **(Optional)** a companies page and/or a homepage "latest AI news" widget
   using `getDigest`.

## UI / UX requirements

- **Arabic-first + RTL:** render Arabic content with `dir="rtl"` and an
  Arabic-friendly font; `title_ar`/`summary_ar` are primary, English secondary.
  Keep Latin tokens (e.g. `GPT-5`, `API`, `SDK`) as-is — they're intentionally
  not transliterated.
- **Badges:** map `impact_level` (low/medium/high/critical) and `category` to
  colored badges; show a check/"موثّق" badge when `verified` is true.
- **Dates:** format `published_at` / `detected_at` with `Intl.DateTimeFormat('ar', …)`.
- **Empty/error states:** if the API is unreachable or returns 0 items, show a
  friendly message, not a crash.
- **Images:** `image_url` can be null → use a branded placeholder.

## Acceptance checklist
- [ ] `AI_NEWS_API_BASE_URL` env wired (+ documented in the app's `.env.example`).
- [ ] Typed server-side client with caching + error handling.
- [ ] News list page (Arabic, RTL) backed by `/api/ai-news/latest`.
- [ ] Article detail page backed by `/api/ai-news/:id` with official-source link.
- [ ] Reusable `NewsCard` with image fallback + badges.
- [ ] No admin endpoints or admin key referenced anywhere in the frontend.
- [ ] Builds and renders with real data from the running API.

Ask me before changing the news API itself — that lives in a different repo.
