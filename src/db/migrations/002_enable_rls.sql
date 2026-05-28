-- Defense in depth for managed Postgres (Supabase).
--
-- This is a backend-only service that connects via a direct Postgres role and
-- OWNS these tables, so RLS does not apply to our own queries (table owners
-- bypass RLS unless FORCE is set). Enabling RLS with no policies ensures that
-- IF Supabase's auto-generated Data API (PostgREST) is left enabled, the public
-- `anon` / `authenticated` roles can never read or write these tables.
--
-- Harmless on local Postgres (no PostgREST; the app connects as the table owner).

ALTER TABLE IF EXISTS sources           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS news_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS job_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS schema_migrations ENABLE ROW LEVEL SECURITY;
