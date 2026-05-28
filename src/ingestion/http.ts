import { config } from '../config';

export interface FetchTextResult {
  status: number;
  ok: boolean;
  text: string;
  contentType: string | null;
  finalUrl: string;
}

/** GET a URL as text with the project user-agent + timeout. Never throws on HTTP status. */
export async function fetchText(url: string, init?: RequestInit): Promise<FetchTextResult> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'user-agent': config.http.userAgent,
      accept: 'text/html,application/xhtml+xml,application/xml,application/rss+xml,*/*',
      ...(init?.headers ?? {}),
    },
    redirect: 'follow',
    signal: init?.signal ?? AbortSignal.timeout(config.http.timeoutMs),
  });
  const text = await res.text();
  return {
    status: res.status,
    ok: res.ok,
    text,
    contentType: res.headers.get('content-type'),
    finalUrl: res.url || url,
  };
}

/** GET a URL as parsed JSON. Throws on non-2xx. */
export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'user-agent': config.http.userAgent,
      accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    redirect: 'follow',
    signal: init?.signal ?? AbortSignal.timeout(config.http.timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}
