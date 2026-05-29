import 'dotenv/config';
import { z } from 'zod';

const boolish = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return def;
      return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
    });

const intish = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return def;
      const n = Number(v);
      return Number.isFinite(n) ? n : def;
    });

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: boolish(false),

  PORT: intish(3001),
  HOST: z.string().optional().default('0.0.0.0'),
  ADMIN_API_KEY: z.string().min(1).optional(),
  // Comma-separated allowed origins for browser (client-side) requests.
  // Empty or "*" = allow any origin (fine for a public read API; no credentials used).
  CORS_ORIGINS: z.string().optional().default('*'),

  // --- Provider-agnostic LLM (any OpenAI-compatible API: OpenRouter, Groq, Gemini, Ollama, …) ---
  LLM_PROVIDER: z.string().optional().default(''), // 'openai' | 'anthropic' | '' (auto-detect)
  LLM_BASE_URL: z.string().optional().default(''), // e.g. https://openrouter.ai/api/v1
  LLM_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().optional().default(''), // fallback model for both tasks
  LLM_MODEL_CLASSIFY: z.string().optional().default(''),
  LLM_MODEL_SUMMARIZE: z.string().optional().default(''),
  LLM_REFERER: z.string().optional().default('https://devarab.com'), // OpenRouter ranking headers
  LLM_TITLE: z.string().optional().default('Dev Arab AI News'),
  // Cap LLM-enriched items per ingestion run (0 = unlimited). Protects free-tier daily limits.
  LLM_MAX_ENRICH_PER_RUN: intish(0),
  // Min delay between LLM calls (ms). Paces requests under free-tier RPM limits. 0 = no delay.
  LLM_MIN_INTERVAL_MS: intish(0),

  // --- Legacy/direct Anthropic (still supported as a provider) ---
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL_CLASSIFY: z.string().optional().default('claude-haiku-4-5-20251001'),
  ANTHROPIC_MODEL_SUMMARIZE: z.string().optional().default('claude-haiku-4-5-20251001'),

  GITHUB_TOKEN: z.string().optional().default(''),

  INGESTION_CRON: z.string().optional().default('0 * * * *'),
  SCHEDULER_ENABLED: boolish(true),
  RUN_INGESTION_ON_START: boolish(false),

  HTTP_USER_AGENT: z
    .string()
    .optional()
    .default('DevArabAINewsBot/0.1 (+https://devarab.com; respects robots.txt)'),
  HTTP_TIMEOUT_MS: intish(15000),
  MAX_ITEMS_PER_SOURCE: intish(15),
  RESPECT_ROBOTS_TXT: boolish(true),

  LOG_LEVEL: z.string().optional().default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;

// Resolve the active LLM provider. Precedence: explicit LLM_PROVIDER, else an
// OpenAI-compatible base URL, else a direct Anthropic key, else disabled.
function resolveLlm() {
  const hasOpenAI = env.LLM_BASE_URL.trim().length > 0;
  const hasAnthropic = env.ANTHROPIC_API_KEY.trim().length > 0;
  const provider =
    (env.LLM_PROVIDER.trim() || (hasOpenAI ? 'openai' : hasAnthropic ? 'anthropic' : 'none')) as
      | 'openai'
      | 'anthropic'
      | 'none';

  if (provider === 'openai') {
    const classifyModel = env.LLM_MODEL_CLASSIFY.trim() || env.LLM_MODEL.trim();
    const summarizeModel = env.LLM_MODEL_SUMMARIZE.trim() || env.LLM_MODEL.trim();
    const isLocal = /localhost|127\.0\.0\.1/.test(env.LLM_BASE_URL);
    const enabled =
      env.LLM_BASE_URL.trim().length > 0 &&
      classifyModel.length > 0 &&
      summarizeModel.length > 0 &&
      (env.LLM_API_KEY.trim().length > 0 || isLocal);
    return {
      provider,
      enabled,
      baseUrl: env.LLM_BASE_URL.replace(/\/+$/, ''),
      apiKey: env.LLM_API_KEY,
      classifyModel,
      summarizeModel,
      referer: env.LLM_REFERER,
      title: env.LLM_TITLE,
      maxEnrichPerRun: env.LLM_MAX_ENRICH_PER_RUN,
      minIntervalMs: env.LLM_MIN_INTERVAL_MS,
    } as const;
  }

  if (provider === 'anthropic') {
    return {
      provider,
      enabled: hasAnthropic,
      baseUrl: '',
      apiKey: env.ANTHROPIC_API_KEY,
      classifyModel: env.ANTHROPIC_MODEL_CLASSIFY,
      summarizeModel: env.ANTHROPIC_MODEL_SUMMARIZE,
      referer: env.LLM_REFERER,
      title: env.LLM_TITLE,
      maxEnrichPerRun: env.LLM_MAX_ENRICH_PER_RUN,
      minIntervalMs: env.LLM_MIN_INTERVAL_MS,
    } as const;
  }

  return {
    provider: 'none',
    enabled: false,
    baseUrl: '',
    apiKey: '',
    classifyModel: '',
    summarizeModel: '',
    referer: env.LLM_REFERER,
    title: env.LLM_TITLE,
    maxEnrichPerRun: env.LLM_MAX_ENRICH_PER_RUN,
    minIntervalMs: env.LLM_MIN_INTERVAL_MS,
  } as const;
}

export const config = {
  database: {
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL,
  },
  server: {
    port: env.PORT,
    host: env.HOST,
    adminApiKey: env.ADMIN_API_KEY,
    // true = reflect any origin; otherwise the explicit allow-list.
    corsOrigins:
      env.CORS_ORIGINS.trim() === '' || env.CORS_ORIGINS.trim() === '*'
        ? true
        : env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  },
  llm: resolveLlm(),
  github: {
    token: env.GITHUB_TOKEN,
  },
  ingestion: {
    cron: env.INGESTION_CRON,
    schedulerEnabled: env.SCHEDULER_ENABLED,
    runOnStart: env.RUN_INGESTION_ON_START,
    maxItemsPerSource: env.MAX_ITEMS_PER_SOURCE,
  },
  http: {
    userAgent: env.HTTP_USER_AGENT,
    timeoutMs: env.HTTP_TIMEOUT_MS,
    respectRobots: env.RESPECT_ROBOTS_TXT,
  },
  logLevel: env.LOG_LEVEL,
} as const;

export type AppConfig = typeof config;
