// URL canonicalization + official-domain verification.

/** Tracking params that never change the identity of a document. */
const STRIP_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'source',
];

/**
 * Canonicalize a URL for stable hashing + dedup:
 * - lowercase scheme + host
 * - drop default ports, fragments, and tracking params
 * - sort remaining query params
 * - strip a trailing slash (except root)
 * Returns the input unchanged if it cannot be parsed.
 */
export function canonicalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return input.trim();
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = '';
  }

  const params = url.searchParams;
  for (const p of STRIP_PARAMS) params.delete(p);
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [k, v] of sorted) url.searchParams.append(k, v);

  let out = url.toString();
  // Remove a single trailing slash on the path (but keep "https://host/").
  if (url.pathname !== '/' && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

/** Normalize a host: lowercase, strip a leading "www." and any trailing dot. */
export function normalizeHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}

export function hostFromUrl(input: string): string | null {
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Verify that a URL belongs to the official domain of a source.
 * Accepts the apex domain and any subdomain of it. Both sides are normalized
 * (www-stripped). Returns false for cross-domain or unparseable URLs.
 *
 * Examples (officialDomain = "openai.com"):
 *   https://openai.com/news/x       -> true
 *   https://www.openai.com/news/x   -> true
 *   https://help.openai.com/x       -> true
 *   https://notopenai.com/x         -> false
 *   https://openai.com.evil.com/x   -> false
 */
export function verifyOfficialDomain(url: string, officialDomain: string): boolean {
  const host = hostFromUrl(url);
  if (!host) return false;
  const h = normalizeHost(host);
  const d = normalizeHost(officialDomain);
  if (!d) return false;
  return h === d || h.endsWith(`.${d}`);
}

/** Resolve a possibly-relative href against a base URL. Returns null on failure. */
export function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
