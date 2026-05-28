import { config } from '../config';
import { logger } from '../logger';
import { getAnthropic } from './client';

export interface ChatCompleteParams {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  /** Request strict JSON output (OpenAI response_format: json_object). */
  json?: boolean;
}

export interface ChatProvider {
  readonly name: string;
  complete(params: ChatCompleteParams): Promise<string>;
}

export type LlmTask = 'classify' | 'summarize';

// LLM responses (esp. large free/open models) can be slow — allow generous time.
const LLM_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Any OpenAI-compatible Chat Completions endpoint (OpenRouter, Groq, Gemini, Ollama, …). */
export class OpenAICompatibleProvider implements ChatProvider {
  readonly name: string;
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly referer: string,
    private readonly title: string,
  ) {
    this.name = `openai:${model}`;
  }

  async complete({ system, user, maxTokens, temperature = 0.2, json }: ChatCompleteParams): Promise<string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    // OpenRouter uses these for attribution/ranking; harmless elsewhere.
    headers['HTTP-Referer'] = this.referer;
    headers['X-Title'] = this.title;

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature,
    };
    if (json) payload.response_format = { type: 'json_object' };
    const body = JSON.stringify(payload);

    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        });
      } catch (err) {
        lastErr = err as Error;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoff(attempt));
          continue;
        }
        throw lastErr;
      }

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          error?: { message?: string };
        };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.length === 0) {
          throw new Error(`empty completion${data.error?.message ? `: ${data.error.message}` : ''}`);
        }
        return content;
      }

      // Retry on rate limits / transient server errors; respect Retry-After.
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt);
        logger.warn('llm rate-limited / server error; backing off', {
          status: res.status,
          attempt,
          waitMs,
        });
        await sleep(waitMs);
        continue;
      }

      const errText = await res.text().catch(() => '');
      throw new Error(`LLM HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`);
    }
    throw lastErr ?? new Error('LLM request failed');
  }
}

/** Direct Anthropic Messages API. */
class AnthropicProvider implements ChatProvider {
  readonly name: string;
  constructor(private readonly model: string) {
    this.name = `anthropic:${model}`;
  }

  async complete({ system, user, maxTokens }: ChatCompleteParams): Promise<string> {
    const client = getAnthropic();
    if (!client) throw new Error('Anthropic client not configured');
    const res = await client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  }
}

function backoff(attempt: number): number {
  const base = Math.min(1000 * 2 ** (attempt - 1), 8000);
  return base + Math.floor(Math.random() * 400); // jitter
}

/** Resolve the configured provider for a task, or null when LLM is disabled. */
export function getProvider(task: LlmTask): ChatProvider | null {
  if (!config.llm.enabled) return null;
  const model = task === 'classify' ? config.llm.classifyModel : config.llm.summarizeModel;
  if (!model) return null;

  if (config.llm.provider === 'openai') {
    return new OpenAICompatibleProvider(
      config.llm.baseUrl,
      config.llm.apiKey,
      model,
      config.llm.referer,
      config.llm.title,
    );
  }
  if (config.llm.provider === 'anthropic') {
    return new AnthropicProvider(model);
  }
  return null;
}
