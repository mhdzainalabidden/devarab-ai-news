-- Dev Arab AI News — initial schema.

-- Enumerations are modelled as CHECK constraints to keep migrations simple and
-- to avoid ALTER TYPE friction when the controlled vocabularies grow.

CREATE TABLE IF NOT EXISTS sources (
  id                      SERIAL PRIMARY KEY,
  company                 TEXT        NOT NULL,
  product                 TEXT,
  source_url              TEXT        NOT NULL UNIQUE,
  source_type             TEXT        NOT NULL CHECK (source_type IN ('rss','html','github','playwright')),
  official_domain         TEXT        NOT NULL,
  priority                INTEGER     NOT NULL DEFAULT 100,
  crawl_interval_minutes  INTEGER     NOT NULL DEFAULT 60,
  active                  BOOLEAN     NOT NULL DEFAULT TRUE,
  last_checked_at         TIMESTAMPTZ,
  last_success_at         TIMESTAMPTZ,
  failure_count           INTEGER     NOT NULL DEFAULT 0,
  extra                   JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sources_active        ON sources (active);
CREATE INDEX IF NOT EXISTS idx_sources_company       ON sources (company);
CREATE INDEX IF NOT EXISTS idx_sources_last_checked  ON sources (last_checked_at);

CREATE TABLE IF NOT EXISTS news_items (
  id                  SERIAL PRIMARY KEY,
  company             TEXT        NOT NULL,
  product             TEXT,
  title_original      TEXT        NOT NULL,
  title_ar            TEXT,
  title_en            TEXT,
  summary_ar          TEXT,
  summary_en          TEXT,
  content_original    TEXT        NOT NULL,
  official_source_url TEXT        NOT NULL,
  source_name         TEXT        NOT NULL,
  source_language     TEXT        NOT NULL DEFAULT 'en',
  category            TEXT        CHECK (category IN
                          ('model','api','coding','security','pricing','research','tool','sdk','product','company','deprecation')),
  tags                TEXT[]      NOT NULL DEFAULT '{}',
  impact_level        TEXT        NOT NULL DEFAULT 'low'
                          CHECK (impact_level IN ('low','medium','high','critical')),
  verified            BOOLEAN     NOT NULL DEFAULT FALSE,
  published_at        TIMESTAMPTZ,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash        TEXT        NOT NULL UNIQUE,
  status              TEXT        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','published','ignored','duplicate','needs_review')),
  source_id           INTEGER     REFERENCES sources(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_detected_at  ON news_items (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news_items (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_company      ON news_items (company);
CREATE INDEX IF NOT EXISTS idx_news_product      ON news_items (product);
CREATE INDEX IF NOT EXISTS idx_news_category     ON news_items (category);
CREATE INDEX IF NOT EXISTS idx_news_status       ON news_items (status);
CREATE INDEX IF NOT EXISTS idx_news_verified     ON news_items (verified);
CREATE INDEX IF NOT EXISTS idx_news_impact       ON news_items (impact_level);
CREATE INDEX IF NOT EXISTS idx_news_tags         ON news_items USING GIN (tags);

CREATE TABLE IF NOT EXISTS job_runs (
  id               SERIAL PRIMARY KEY,
  job_name         TEXT        NOT NULL,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  status           TEXT        NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running','success','partial','failed')),
  sources_checked  INTEGER     NOT NULL DEFAULT 0,
  items_found      INTEGER     NOT NULL DEFAULT 0,
  items_inserted   INTEGER     NOT NULL DEFAULT 0,
  items_skipped    INTEGER     NOT NULL DEFAULT 0,
  errors           INTEGER     NOT NULL DEFAULT 0,
  detail           JSONB
);

CREATE INDEX IF NOT EXISTS idx_job_runs_started ON job_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_name    ON job_runs (job_name, started_at DESC);
