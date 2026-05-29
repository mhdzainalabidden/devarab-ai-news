import type { NewsItem, Source } from '../src/types';

export function makeNewsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 1,
    company: 'OpenAI',
    product: 'API',
    title_original: 'New model released',
    title_ar: 'إطلاق نموذج جديد',
    title_en: 'New model released',
    summary_ar: 'ملخص عربي قصير.',
    summary_en: 'Short English summary.',
    content_original: '<p>raw</p>',
    official_source_url: 'https://openai.com/news/new-model',
    image_url: 'https://openai.com/img/new-model.png',
    source_name: 'OpenAI · Newsroom',
    source_language: 'en',
    category: 'model',
    tags: ['gpt', 'model'],
    impact_level: 'high',
    verified: true,
    published_at: new Date('2026-05-28T10:00:00Z'),
    detected_at: new Date('2026-05-28T10:05:00Z'),
    content_hash: 'a'.repeat(64),
    status: 'published',
    source_id: 1,
    created_at: new Date('2026-05-28T10:05:00Z'),
    updated_at: new Date('2026-05-28T10:05:00Z'),
    ...overrides,
  };
}

export function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 1,
    company: 'OpenAI',
    product: 'Newsroom',
    source_url: 'https://openai.com/news/rss.xml',
    source_type: 'rss',
    official_domain: 'openai.com',
    priority: 10,
    crawl_interval_minutes: 60,
    active: true,
    last_checked_at: null,
    last_success_at: null,
    failure_count: 0,
    extra: null,
    ...overrides,
  };
}
