import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAICompatibleProvider } from '../src/llm/provider';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OpenAICompatibleProvider', () => {
  it('sends OpenAI-shaped request with auth + returns the content', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAICompatibleProvider(
      'https://openrouter.ai/api/v1',
      'sk-test',
      'meta-llama/llama-3.3-70b-instruct:free',
      'https://devarab.com',
      'Dev Arab AI News',
    );
    const out = await provider.complete({ system: 'sys', user: 'usr', maxTokens: 100 });
    expect(out).toBe('{"ok":true}');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-test');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('meta-llama/llama-3.3-70b-instruct:free');
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
  });

  it('retries on HTTP 429 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'rate limited' } }, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'done' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAICompatibleProvider('http://x/v1', 'k', 'm', 'r', 't');
    const out = await provider.complete({ system: 's', user: 'u', maxTokens: 10 });
    expect(out).toBe('done');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on a non-retryable error status', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, 401));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAICompatibleProvider('http://x/v1', 'k', 'm', 'r', 't');
    await expect(provider.complete({ system: 's', user: 'u', maxTokens: 10 })).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the completion is empty', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAICompatibleProvider('http://x/v1', 'k', 'm', 'r', 't');
    await expect(provider.complete({ system: 's', user: 'u', maxTokens: 10 })).rejects.toThrow(/empty/);
  });
});
