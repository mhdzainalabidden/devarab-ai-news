import type { UpsertSourceInput } from '../../repositories/sources.repo';
import type { HtmlFetchConfig } from '../../types';

// Generic listing selectors for blog/changelog pages where we don't have a
// hand-tuned config. HTML structures drift, so these are best-effort: items
// that parse poorly are stored as `needs_review`, never published blindly.
const GENERIC: HtmlFetchConfig = {
  itemSelector: 'article, li.post, .changelog-entry, main a[href]',
  titleSelector: 'h1, h2, h3',
  linkSelector: 'a',
  dateSelector: 'time',
  contentSelector: 'p',
};

/**
 * Seed catalog of official / primary sources.
 *
 * Reliability tiers:
 *  - `github` and `rss` sources are the most robust (stable, structured).
 *  - `html` sources are best-effort; their selectors may need tuning over time
 *    via POST /api/admin/sources as sites change.
 *  - `playwright` sources need `npm i -D playwright && npx playwright install`
 *    and are seeded inactive so the service runs cleanly out of the box.
 */
export const SEED_SOURCES: UpsertSourceInput[] = [
  // ---------- OpenAI ----------
  {
    company: 'OpenAI',
    product: 'Newsroom',
    source_url: 'https://openai.com/news/rss.xml',
    source_type: 'rss',
    official_domain: 'openai.com',
    priority: 10,
    crawl_interval_minutes: 60,
  },
  {
    company: 'OpenAI',
    product: 'API Changelog',
    source_url: 'https://platform.openai.com/docs/changelog',
    source_type: 'playwright',
    official_domain: 'openai.com',
    priority: 10,
    crawl_interval_minutes: 120,
    active: false, // needs Playwright (JS-rendered docs)
    extra: {
      html: {
        itemSelector: 'main section, main article, main li',
        titleSelector: 'h2, h3',
        linkSelector: 'a',
        contentSelector: 'p, li',
      },
    },
  },
  {
    company: 'OpenAI',
    product: 'Node SDK',
    source_url: 'https://github.com/openai/openai-node/releases',
    source_type: 'github',
    official_domain: 'github.com',
    priority: 40,
    crawl_interval_minutes: 180,
    extra: { github: { owner: 'openai', repo: 'openai-node', mode: 'releases' } },
  },

  // ---------- Google / DeepMind ----------
  {
    company: 'Google',
    product: 'AI Blog',
    source_url: 'https://blog.google/technology/ai/rss/',
    source_type: 'rss',
    official_domain: 'blog.google',
    priority: 20,
    crawl_interval_minutes: 60,
  },
  {
    company: 'Google DeepMind',
    product: 'Blog',
    source_url: 'https://deepmind.google/discover/blog/',
    source_type: 'html',
    official_domain: 'deepmind.google',
    priority: 20,
    crawl_interval_minutes: 120,
    extra: { html: GENERIC },
  },
  {
    company: 'Google',
    product: 'Gemini API Release Notes',
    source_url: 'https://ai.google.dev/gemini-api/docs/changelog',
    source_type: 'html',
    official_domain: 'google.dev',
    priority: 15,
    crawl_interval_minutes: 120,
    extra: {
      html: {
        itemSelector: 'main h2, main h3',
        titleSelector: 'self',
        linkSelector: 'a',
        contentSelector: 'p',
      },
    },
  },

  // ---------- Anthropic / Claude ----------
  {
    company: 'Anthropic',
    product: 'News',
    source_url: 'https://www.anthropic.com/news',
    source_type: 'html',
    official_domain: 'anthropic.com',
    priority: 10,
    crawl_interval_minutes: 60,
    extra: {
      html: {
        itemSelector: 'a[href*="/news/"]',
        titleSelector: 'h2, h3',
        contentSelector: 'p',
      },
    },
  },
  {
    company: 'Anthropic',
    product: 'Research',
    source_url: 'https://www.anthropic.com/research',
    source_type: 'html',
    official_domain: 'anthropic.com',
    priority: 30,
    crawl_interval_minutes: 240,
    extra: {
      html: {
        itemSelector: 'a[href*="/research/"]',
        titleSelector: 'h2, h3',
        contentSelector: 'p',
      },
    },
  },
  {
    company: 'Anthropic',
    product: 'Claude API Release Notes',
    source_url: 'https://docs.claude.com/en/release-notes/api',
    source_type: 'html',
    official_domain: 'claude.com',
    priority: 10,
    crawl_interval_minutes: 120,
    extra: {
      html: {
        itemSelector: 'main h2, main h3',
        titleSelector: 'self',
        linkSelector: 'a',
        contentSelector: 'p, li',
      },
    },
  },
  {
    company: 'Anthropic',
    product: 'Claude Code Changelog',
    source_url: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md',
    source_type: 'github',
    official_domain: 'github.com',
    priority: 15,
    crawl_interval_minutes: 120,
    extra: { github: { owner: 'anthropics', repo: 'claude-code', mode: 'file', path: 'CHANGELOG.md' } },
  },

  // ---------- Cursor ----------
  {
    company: 'Cursor',
    product: 'Changelog',
    source_url: 'https://cursor.com/changelog',
    source_type: 'html',
    official_domain: 'cursor.com',
    priority: 20,
    crawl_interval_minutes: 120,
    extra: {
      html: {
        itemSelector: 'article, [class*="changelog"] article, main section',
        titleSelector: 'h1, h2, h3',
        linkSelector: 'a',
        dateSelector: 'time',
        contentSelector: 'p',
      },
    },
  },

  // ---------- Replit ----------
  {
    company: 'Replit',
    product: 'Blog',
    source_url: 'https://blog.replit.com/feed.xml',
    source_type: 'rss',
    official_domain: 'replit.com',
    priority: 40,
    crawl_interval_minutes: 240,
  },

  // ---------- GitHub Copilot ----------
  {
    company: 'GitHub',
    product: 'Copilot Changelog',
    source_url: 'https://github.blog/changelog/label/copilot/feed/',
    source_type: 'rss',
    official_domain: 'github.blog',
    priority: 20,
    crawl_interval_minutes: 120,
  },

  // ---------- Mistral ----------
  {
    company: 'Mistral',
    product: 'News',
    source_url: 'https://mistral.ai/news',
    source_type: 'html',
    official_domain: 'mistral.ai',
    priority: 25,
    crawl_interval_minutes: 120,
    extra: { html: { ...GENERIC, itemSelector: 'a[href*="/news/"]', titleSelector: 'h2, h3' } },
  },
  {
    company: 'Mistral',
    product: 'Docs Changelog',
    source_url: 'https://docs.mistral.ai/getting-started/changelog/',
    source_type: 'html',
    official_domain: 'mistral.ai',
    priority: 30,
    crawl_interval_minutes: 240,
    extra: {
      html: { itemSelector: 'main h2, main h3', titleSelector: 'self', contentSelector: 'p, li' },
    },
  },

  // ---------- Hugging Face ----------
  {
    company: 'Hugging Face',
    product: 'Blog',
    source_url: 'https://huggingface.co/blog/feed.xml',
    source_type: 'rss',
    official_domain: 'huggingface.co',
    priority: 30,
    crawl_interval_minutes: 120,
  },

  // ---------- Vercel ----------
  {
    company: 'Vercel',
    product: 'Changelog',
    source_url: 'https://vercel.com/changelog',
    source_type: 'html',
    official_domain: 'vercel.com',
    priority: 30,
    crawl_interval_minutes: 180,
    extra: {
      html: {
        itemSelector: 'article, main a[href*="/changelog/"]',
        titleSelector: 'h1, h2, h3',
        linkSelector: 'a',
        dateSelector: 'time',
        contentSelector: 'p',
      },
    },
  },
  {
    company: 'Vercel',
    product: 'AI SDK',
    source_url: 'https://github.com/vercel/ai/releases',
    source_type: 'github',
    official_domain: 'github.com',
    priority: 25,
    crawl_interval_minutes: 180,
    extra: { github: { owner: 'vercel', repo: 'ai', mode: 'releases' } },
  },

  // ---------- Meta AI ----------
  {
    company: 'Meta AI',
    product: 'Blog',
    source_url: 'https://ai.meta.com/blog/',
    source_type: 'html',
    official_domain: 'meta.com',
    priority: 35,
    crawl_interval_minutes: 180,
    extra: { html: GENERIC },
  },

  // ---------- xAI ----------
  {
    company: 'xAI',
    product: 'News',
    source_url: 'https://x.ai/news',
    source_type: 'html',
    official_domain: 'x.ai',
    priority: 35,
    crawl_interval_minutes: 180,
    extra: { html: { ...GENERIC, itemSelector: 'a[href*="/news/"]', titleSelector: 'h2, h3' } },
  },

  // ---------- Perplexity ----------
  {
    company: 'Perplexity',
    product: 'Blog',
    source_url: 'https://www.perplexity.ai/hub/blog',
    source_type: 'html',
    official_domain: 'perplexity.ai',
    priority: 40,
    crawl_interval_minutes: 240,
    extra: { html: GENERIC },
  },

  // ---------- Cohere ----------
  {
    company: 'Cohere',
    product: 'Blog',
    source_url: 'https://cohere.com/blog',
    source_type: 'html',
    official_domain: 'cohere.com',
    priority: 40,
    crawl_interval_minutes: 240,
    extra: { html: GENERIC },
  },

  // ---------- DeepSeek ----------
  {
    company: 'DeepSeek',
    product: 'News',
    source_url: 'https://api-docs.deepseek.com/news',
    source_type: 'html',
    official_domain: 'deepseek.com',
    priority: 35,
    crawl_interval_minutes: 180,
    extra: {
      html: { itemSelector: 'main a[href*="/news/"], article', titleSelector: 'h1, h2, h3', contentSelector: 'p' },
    },
  },
];
