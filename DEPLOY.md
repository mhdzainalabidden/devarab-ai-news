# Deployment — managed DB + cloud cron (free)

Goal: remove the local-Docker single point of failure. The database moves to
**Supabase (free, always-on, automatic backups)** and hourly ingestion runs on
**GitHub Actions (free)** — so neither your PC nor Docker needs to be running.

The Node API is stateless: host it anywhere (or keep it local). The data and the
schedule no longer depend on your machine.

---

## 1. Create the Supabase database (free)

1. Go to <https://supabase.com/dashboard> → sign in (GitHub/email, no card).
2. **New project** → name it (e.g. `devarab-ai-news`), set a strong **database
   password** (save it), pick the region closest to your API host.
3. Wait ~2 min for it to provision.
4. **Connect** (top bar) → **Connection string** → choose **Session pooler** →
   copy the URI. It looks like:

   ```
   postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

   > Use the **Session pooler (5432)** — it's IPv4-compatible and supports
   > node-postgres prepared statements, and the same URL works for both the
   > long-running API and the GitHub Actions cron. Avoid the transaction pooler
   > (6543) for the long-running pool, and the direct connection (IPv6-only).

## 2. Point the app at Supabase

In `.env` (local) set:

```
DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
```

Then create the schema + seed the sources on Supabase:

```bash
npm run migrate   # creates tables + enables RLS (002)
npm run seed      # loads the official sources
```

(Optional) copy your existing local rows over with `pg_dump`:

```bash
docker exec devarab-ai-news-db pg_dump -U postgres -d devarab_ai_news \
  --data-only --table=sources --table=news_items --table=job_runs \
  > backup.sql
psql "$DATABASE_URL" -f backup.sql
```

## 3. Put the repo on GitHub + add secrets

```bash
git init && git add -A && git commit -m "AI news subsystem"
gh repo create devarab-ai-news --public --source=. --push   # public = unlimited Actions minutes
```

Add repository secrets (Settings → Secrets and variables → Actions, or via CLI):

```bash
gh secret set DATABASE_URL --body "postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres"
gh secret set LLM_API_KEY  --body "AIza..."     # your Gemini key
```

The workflow in `.github/workflows/ingest.yml` then runs **hourly**: `migrate`
→ `ingest` → `enrich 20`. Trigger it once manually from the **Actions** tab
(or `gh workflow run "AI News Ingestion"`) to verify.

> **Free minutes:** unlimited on **public** repos. On a private repo (~2,000
> min/month free), change the cron to `'0 */2 * * *'` (every 2 hours) to stay
> well within the limit.

## 4. Host the API (so the main app can reach it)

The API is a **stateless** read service (all state is in Supabase), so hosting is
simple and you can restart/redeploy anytime with zero data loss.

### Env vars the hosted instance needs
| Var | Value | Why |
|---|---|---|
| `DATABASE_URL` | Supabase session-pooler URI | data |
| `DATABASE_SSL` | `true` | Supabase requires SSL |
| `HOST` | `0.0.0.0` | accept external traffic (NOT 127.0.0.1) |
| `PORT` | (usually injected by the platform) | the app reads it |
| `SCHEDULER_ENABLED` | **`false`** | **critical** — GitHub Actions already ingests every 15 min; leaving the in-process scheduler on would double-ingest |
| `CORS_ORIGINS` | e.g. `https://devarab.com` | lock down from `*` in production |
| `ADMIN_API_KEY` | a strong secret | only if you want the admin endpoints reachable |
| `LLM_*`, `GITHUB_TOKEN` | optional | only if the host should run ingestion/enrichment itself (it doesn't — GH Actions does) |

> **tsx must exist at runtime.** The app starts via `tsx` (no build step). Most
> platforms run `npm ci` which installs devDependencies by default — but if a
> platform sets `NODE_ENV=production` (skipping devDeps), `npm start` fails.
> Safe fix: move `tsx` into `dependencies` (or add a compile step).

### Options (all have a free tier)
- **Render — simplest.** New → Web Service → connect the repo. Build `npm ci`,
  Start `npm start`, health check `/health`, set the env vars above. Gives a
  public URL like `https://devarab-ai-news.onrender.com`. Caveat: free tier
  **sleeps after ~15 min idle** (slow first request) — mostly hidden by the
  devArab app caching responses server-side.
- **Vercel — same ecosystem as devArab.** Needs a tiny serverless adapter that
  exports the Fastify app as a handler (no `listen`, scheduler off) + a
  `vercel.json`. Free hobby tier, co-located with the Next.js app.
- **Fly.io — no cold starts.** A `Dockerfile` + `fly.toml`; `flyctl launch` /
  `deploy`. Always-on small VM on the free allowance.

### After hosting
Point the devArab app at it: set `AI_NEWS_API_BASE_URL=https://<your-host>` in
the devArab env, and set this API's `CORS_ORIGINS` to the devArab origin(s).

## Resilience summary

| Component | Before | After |
|---|---|---|
| Data | Local Docker Postgres (dies with Docker/PC) | Supabase: always-on + daily backups |
| Hourly job | `npm start` scheduler on your PC | GitHub Actions cron (runs even if PC is off) |
| API | Local process | Stateless — redeploy/restart anywhere, no data loss |
