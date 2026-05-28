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

The API (`npm start`) is stateless and just needs `DATABASE_URL` + `DATABASE_SSL=true`.
Options: keep it local for now, run it on any small always-on host, or deploy
serverless. Because all state lives in Supabase, you can restart/redeploy the API
anytime with zero data loss — that's your "backup," without a redundant server.

## Resilience summary

| Component | Before | After |
|---|---|---|
| Data | Local Docker Postgres (dies with Docker/PC) | Supabase: always-on + daily backups |
| Hourly job | `npm start` scheduler on your PC | GitHub Actions cron (runs even if PC is off) |
| API | Local process | Stateless — redeploy/restart anywhere, no data loss |
