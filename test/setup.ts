// Provide a valid environment BEFORE any module (esp. src/config.ts) is imported.
// config.ts validates process.env at import time and exits the process if invalid,
// so these must be set in a vitest setupFile (which runs before test modules load).
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.DATABASE_SSL ??= 'false';
process.env.ADMIN_API_KEY ??= 'test-admin-key';
process.env.SCHEDULER_ENABLED ??= 'false';
process.env.RESPECT_ROBOTS_TXT ??= 'true';
process.env.LOG_LEVEL ??= 'error';

// Force the LLM OFF for unit tests so the disabled/fallback paths are exercised
// and no real network calls are made. These are set (not ??=) BEFORE config.ts
// imports dotenv — which won't override already-defined vars — so a populated
// real .env (with a live LLM key) can't leak into the test run.
process.env.LLM_PROVIDER = '';
process.env.LLM_BASE_URL = '';
process.env.LLM_API_KEY = '';
process.env.LLM_MODEL = '';
process.env.LLM_MODEL_CLASSIFY = '';
process.env.LLM_MODEL_SUMMARIZE = '';
process.env.ANTHROPIC_API_KEY = '';
// Keep operational pacing/caps deterministic + fast in tests (don't inherit .env).
process.env.LLM_MAX_ENRICH_PER_RUN = '0';
process.env.LLM_MIN_INTERVAL_MS = '0';
