import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

let client: Anthropic | null = null;

/** Returns a shared Anthropic client, or null unless the Anthropic provider is active. */
export function getAnthropic(): Anthropic | null {
  if (!config.llm.enabled || config.llm.provider !== 'anthropic') return null;
  if (!client) client = new Anthropic({ apiKey: config.llm.apiKey });
  return client;
}

/** Extract the first JSON object from a model text response, tolerating prose/code fences. */
export function extractJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
