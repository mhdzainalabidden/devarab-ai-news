import { describe, it, expect, afterEach, vi } from 'vitest';

// config.ts reads process.env at import time, so each case mutates env then
// re-imports a fresh module graph via vi.resetModules().
const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

describe('config.llm provider resolution', () => {
  it('auto-detects an OpenAI-compatible provider from LLM_BASE_URL (e.g. OpenRouter)', async () => {
    vi.resetModules();
    process.env.LLM_BASE_URL = 'https://openrouter.ai/api/v1/';
    process.env.LLM_API_KEY = 'sk-or-test';
    process.env.LLM_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
    delete process.env.ANTHROPIC_API_KEY;

    const { config } = await import('../src/config');
    expect(config.llm.provider).toBe('openai');
    expect(config.llm.enabled).toBe(true);
    expect(config.llm.baseUrl).toBe('https://openrouter.ai/api/v1'); // trailing slash trimmed
    expect(config.llm.classifyModel).toBe('meta-llama/llama-3.3-70b-instruct:free');
    expect(config.llm.summarizeModel).toBe('meta-llama/llama-3.3-70b-instruct:free');
  });

  it('treats an OpenAI-compatible provider with no key/model as disabled', async () => {
    vi.resetModules();
    process.env.LLM_BASE_URL = 'https://openrouter.ai/api/v1';
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_MODEL_CLASSIFY;
    delete process.env.LLM_MODEL_SUMMARIZE;
    delete process.env.ANTHROPIC_API_KEY;

    const { config } = await import('../src/config');
    expect(config.llm.enabled).toBe(false);
  });

  it('allows a local Ollama endpoint without an API key', async () => {
    vi.resetModules();
    process.env.LLM_BASE_URL = 'http://localhost:11434/v1';
    delete process.env.LLM_API_KEY;
    process.env.LLM_MODEL = 'qwen2.5';
    delete process.env.ANTHROPIC_API_KEY;

    const { config } = await import('../src/config');
    expect(config.llm.provider).toBe('openai');
    expect(config.llm.enabled).toBe(true);
  });

  it('is disabled when nothing is configured', async () => {
    vi.resetModules();
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    process.env.ANTHROPIC_API_KEY = '';

    const { config } = await import('../src/config');
    expect(config.llm.provider).toBe('none');
    expect(config.llm.enabled).toBe(false);
  });
});
