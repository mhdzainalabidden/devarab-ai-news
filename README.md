# Dev Arab — AI News API Subsystem

A backend service that tracks **official / primary** AI sources, verifies updates,
summarizes them **Arabic-first** (with a short English version), stores them with
the raw source for audit, and exposes JSON APIs for the Dev Arab main app.

> No website here — this is an ingestion engine + JSON API only.

## What it does

Every hour it checks official sources for OpenAI, Google / Gemini / DeepMind,
Anthropic / Claude, Cursor, Replit, GitHub Copilot, Mistral, Hugging Face,
Vercel (AI SDK), Meta AI, xAI, Perplexity, Cohere and DeepSeek for models, APIs,
tools, pricing changes, deprecations, security updates, SDK updates, changelog
entries and developer launches.

For each item it:

1. Loads active sources that are due for checking.
2. Fetches content (RSS, official static HTML via Cheerio, the GitHub API for
   releases/changelogs, or Playwright for JS-rendered pages).
3. Extracts the latest posts / changelog entries / releases.
4. Normalizes title, URL, body, date, company, product.
5. Computes a `content_hash` from the canonical URL + title + cleaned body.
6. Skips duplicates (hash + a DB `UNIQUE` constraint).
7. **Verifies the URL domain matches the source's `official_domain`** — this, not
   the LLM, is what sets `verified`.
8. Classifies category, tags, and impact level.
9. Generates an Arabic title/summary and an English title/summary.
10. Saves as `published` when the source is official **and** confidence is high.
11. Saves as `needs_review` when parsing/summarization is uncertain or the link is
    off-domain.
12. Exposes everything through the API.

**Rules enforced in code**

- Only official/primary sources are ever marked `verified`.
- `verified` is derived purely from domain matching — the LLM is never the source
  of truth, only for classification + bilingual summaries.
- Every stored item keeps its `official_source_url` and the raw `content_original`
  for audit.
- `robots.txt`, request timeouts, and per-source crawl intervals are respected.

## Stack

- **Node.js + TypeScript** (ESM, run with `tsx`).
- **Fastify** for the HTTP API.
- **PostgreSQL / Supabase** via `pg` (plain SQL migrations, no ORM).
- **node-cron** in-process scheduler (swappable for external cron / Trigger.dev /
  BullMQ — see "Scheduling" below).
- **rss-parser**, **cheerio**, the **GitHub REST API**, and optional **Playwright**.
- **Provider-agnostic LLM** for classification + bilingual summaries (optional —
  the service runs in heuristic fallback mode without one). Works with any
  OpenAI-compatible API: **OpenRouter**, **Groq**, **Gemini**, local **Ollama**,
  or **Anthropic** directly.

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
#   - set DATABASE_URL (Postgres/Supabase)
#   - set ADMIN_API_KEY (protects the admin endpoints)
#   - optionally set LLM_BASE_URL + LLM_API_KEY + LLM_MODEL for real bilingual summaries (see "Choosing an LLM")
#   - optionally set GITHUB_TOKEN to raise GitHub rate limits

# 3. Create the schema + seed official sources
npm run migrate
npm run seed

# 4. Run one ingestion pass (optional, good for a first test)
npm run ingest -- --force

# 5. Start the API + hourly scheduler
npm run dev      # watch mode
# or
npm start        # production (runs TypeScript directly via tsx)
```

> The service runs TypeScript directly with `tsx` (used by `start`, `dev`,
> `migrate`, `seed`, and `ingest`). `npm run build` type-checks the whole project.

### Choosing an LLM (free options)

The LLM is **provider-agnostic** — any OpenAI-compatible endpoint. Set three vars:

```bash
LLM_BASE_URL=https://openrouter.ai/api/v1          # provider endpoint
LLM_API_KEY=sk-or-...                              # your key (omit for local Ollama)
LLM_MODEL=deepseek/deepseek-chat-v3-0324:free      # model
```

| Provider | `LLM_BASE_URL` | Example `LLM_MODEL` | Notes |
|---|---|---|---|
| **OpenRouter** | `https://openrouter.ai/api/v1` | `deepseek/deepseek-chat-v3-0324:free` | Free `:free` models; **daily request cap** |
| **Groq** | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Fast free tier |
| **Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` | Strong Arabic, generous free tier |
| **Ollama (local)** | `http://localhost:11434/v1` | `qwen2.5` | 100% free/offline, no key |
| **Anthropic** | *(leave blank)* | set `ANTHROPIC_API_KEY` | Direct Messages API |

**Rate limits:** free tiers cap daily/per-minute requests. The OpenAI-compatible
client retries on `429`/`5xx` with backoff, and `LLM_MAX_ENRICH_PER_RUN` caps how
many items each ingestion run will enrich (default 30). Items beyond the cap (or
ingested before an LLM was set) stay `needs_review` until you backfill them:

```bash
npm run enrich            # enrich up to 10 pending verified items
npm run enrich -- 25      # enrich up to 25
```

### Without any LLM

The service still runs. Classification falls back to a keyword heuristic and
summaries fall back to the original text at **low confidence**, which routes those
items to `status = needs_review` instead of `published`.

## API

Base path: `/api/ai-news`. List feeds default to **newest-first**.

### `GET /api/ai-news`
Public feed with filters, configurable ordering, and pagination.

| query param | values | notes |
|---|---|---|
| `lang` | `ar` \| `en` \| `both` | default `both` |
| `limit` | 1–100 | default 20 |
| `offset` | ≥ 0 | default 0 |
| `company` | e.g. `OpenAI` | case-insensitive |
| `product` | e.g. `API` | case-insensitive |
| `category` | `model` `api` `coding` `security` `pricing` `research` `tool` `sdk` `product` `company` `deprecation` | |
| `status` | `published` | restricts to published rows; internal statuses are never exposed |
| `verified` | `true` \| `false` | |
| `impact` | `low` \| `medium` \| `high` \| `critical` | |
| `tag` | e.g. `gpt-5` | matches the `tags` array |
| `sort` | `recent` \| `oldest` | default `recent` (newest-first) on the active date field |
| `date_field` | `detected` \| `published` | which date column ordering + date filters use. `detected` (default) = ingest time ("what's new in the feed"); `published` = article publication date |
| `since` / `window` | `24h` \| `7d` \| `30m` \| ISO timestamp | lower bound on the active date field (`window` is an alias) |
| `from` | ISO timestamp \| relative | explicit lower bound; alias for `since` (wins if both set) |
| `to` | ISO timestamp \| relative | upper bound on the active date field |

Response (additive — `count`/`items` unchanged):

```jsonc
{
  "lang": "both",
  "count": 20,          // items on this page
  "total": 137,         // rows matching the filters
  "limit": 20,
  "offset": 0,
  "has_more": true,
  "next_offset": 20,    // null when has_more is false
  "items": [ /* ... */ ]
}
```

### `GET /api/ai-news/latest`
Verified, published items only. Accepts `lang`, `company`, `category`, `limit`.

### `GET /api/ai-news/:id`
One item with extra metadata (`content_hash`, `source_id`, timestamps).

### `GET /api/ai-news/digest?lang=both&window=24h|7d`
Published items grouped by company → category over the window.

### `GET /api/ai-news/companies`
Tracked companies with active source counts, `last_checked_at`, and the last
detected update.

### `POST /api/admin/sources` *(admin)*
Add or update an official source. Header: `x-admin-key: <ADMIN_API_KEY>`.

```jsonc
{
  "company": "OpenAI",
  "product": "Newsroom",
  "source_url": "https://openai.com/news/rss.xml",
  "source_type": "rss",            // rss | html | github | playwright
  "official_domain": "openai.com",
  "priority": 10,                   // optional, lower = checked first
  "crawl_interval_minutes": 60,     // optional
  "active": true,                   // optional
  "extra": {                        // required for html/github sources
    "html":   { "itemSelector": "article", "titleSelector": "h2", "linkSelector": "a", "contentSelector": "p", "dateSelector": "time" },
    "github": { "owner": "vercel", "repo": "ai", "mode": "releases" }
  }
}
```

### `POST /api/admin/run-ingestion` *(admin)*
Manually trigger ingestion. Body (all optional): `{ "force": true, "sourceIds": [1,2], "async": true }`.
Returns the run summary (or `202` when `async`).

### `GET /api/admin/health` *(admin)*
Latest + recent ingestion job runs and a `healthy` flag.

### Response shape (each news item)
```jsonc
{
  "id": 1,
  "company": "OpenAI",
  "product": "Newsroom",
  "category": "model",
  "impact_level": "high",
  "verified": true,
  "title_ar": "…",
  "summary_ar": "…",
  "title_en": "…",
  "summary_en": "…",
  "tags": ["gpt-5", "model"],
  "official_source_url": "https://openai.com/news/…",
  "source_name": "OpenAI · Newsroom",
  "source_language": "en",
  "status": "published",
  "published_at": "2026-05-28T10:00:00.000Z",
  "detected_at": "2026-05-28T10:05:00.000Z"
}
```

## Data model

- **`sources`** — `id, company, product, source_url, source_type, official_domain,
  priority, crawl_interval_minutes, active, last_checked_at, last_success_at,
  failure_count, extra`.
  > `extra` (jsonb) is an extension to the spec's columns: it holds the per-source
  > HTML selectors / GitHub repo coordinates needed for generic fetching.
- **`news_items`** — `id, company, product, title_original, title_ar, title_en,
  summary_ar, summary_en, content_original, official_source_url, source_name,
  source_language, category, tags, impact_level, verified, published_at,
  detected_at, content_hash, status, source_id`.
  - `status`: `draft | published | ignored | duplicate | needs_review`
  - `impact_level`: `low | medium | high | critical`
- **`job_runs`** — ingestion run health/audit (counts, status, per-source detail).

## Scheduling

The in-process scheduler (`INGESTION_CRON`, default `0 * * * *`) runs hourly.
Set `SCHEDULER_ENABLED=false` to disable it and instead drive ingestion from an
external scheduler:

```bash
# Cron / GitHub Actions / Trigger.dev task / BullMQ worker, etc.
npm run ingest          # only sources past their crawl_interval
npm run ingest -- --force
# or call POST /api/admin/run-ingestion
```

Each source has its own `crawl_interval_minutes`, so a frequent global tick still
only fetches sources that are actually due.

## Seed sources & reliability

`npm run seed` loads the official sources for every tracked company.

- **`github` / `rss`** sources are the most robust.
- **`html`** sources are best-effort: site markup drifts, so their CSS selectors
  may need occasional tuning via `POST /api/admin/sources`. Poorly-parsed items
  are stored as `needs_review`, never published blindly.
- **`playwright`** sources (e.g. OpenAI's JS-rendered API changelog) are seeded
  **inactive**. To enable them:
  ```bash
  npm i -D playwright && npx playwright install chromium
  # then activate the source via POST /api/admin/sources (active: true)
  ```

## Testing

```bash
npm test          # vitest run
npm run typecheck
```

Tests cover URL canonicalization + domain verification, content hashing &
deduplication, HTML/whitespace cleaning, the robots.txt parser, heuristic
classification, LLM output normalization, bilingual fallback, the news query
builder + API filters, response serialization, the full ingestion workflow
(fetch → dedupe → verify → classify → summarize → persist), and job health.
Tests use injected fakes — no database, network, or LLM calls required.

## Project layout

```
src/
  config.ts                 env config (zod-validated)
  types.ts                  shared domain types + enums
  db/                        pool, migrations, seed runner, seed catalog
  repositories/              sources, news_items, job_runs, pure news query builder
  ingestion/
    url.ts clean.ts hash.ts robots.ts http.ts   core utilities
    fetchers/               rss, html (cheerio), github, playwright
    normalize.ts            normalization + status decision (pure)
    orchestrator.ts         the hourly 12-step workflow
    runLock.ts              process-wide ingestion guard
  llm/                       Anthropic client, heuristics, classify, summarize
  api/                       Fastify server, deps, serialize, routes
  jobs/scheduler.ts          node-cron scheduler
  llm/                       provider.ts (OpenAI-compatible + Anthropic), enrich (1 merged call: classify + bilingual summary), heuristics
  scripts/ingest-once.ts     one-shot ingestion CLI
  scripts/enrich-pending.ts  backfill LLM enrichment onto needs_review items
  index.ts                   entrypoint (migrate → serve → schedule)
test/                        vitest suites
```
