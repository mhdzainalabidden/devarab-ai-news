import { config } from '../config';
import { logger } from '../logger';

interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
}

/** Parse robots.txt content into agent groups with allow/disallow rules. */
export function parseRobots(content: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawRuleSinceAgent = false;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      // A new user-agent after rules starts a fresh group.
      if (!current || sawRuleSinceAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRuleSinceAgent = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (field === 'allow' || field === 'disallow') {
      if (!current) {
        current = { agents: ['*'], rules: [] };
        groups.push(current);
      }
      sawRuleSinceAgent = true;
      // An empty Disallow means "allow all"; skip it as a rule.
      if (field === 'disallow' && value === '') continue;
      current.rules.push({ allow: field === 'allow', path: value });
    }
  }
  return { groups };
}

function matchRule(path: string, rulePath: string): number {
  // Supports the common "*" wildcard and "$" end-anchor extensions.
  // Returns the match length for longest-match precedence, or -1 if no match.
  if (rulePath === '') return -1;
  const hasEnd = rulePath.endsWith('$');
  const pattern = hasEnd ? rulePath.slice(0, -1) : rulePath;
  const parts = pattern.split('*');
  let cursor = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part === '') continue;
    const found = path.indexOf(part, cursor);
    if (i === 0 && found !== 0) return -1; // first segment must anchor at start
    if (found === -1) return -1;
    cursor = found + part.length;
  }
  if (hasEnd && cursor !== path.length) return -1;
  return pattern.replace(/\*/g, '').length;
}

/** Decide whether `path` is allowed for `userAgent` per parsed robots rules. */
export function isPathAllowed(parsed: ParsedRobots, path: string, userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  // Pick the most specific matching group: exact agent token match wins over "*".
  let chosen: RobotsGroup | null = null;
  let chosenSpecificity = -1;
  for (const group of parsed.groups) {
    for (const agent of group.agents) {
      let spec = -1;
      if (agent === '*') spec = 0;
      else if (ua.includes(agent)) spec = agent.length;
      if (spec > chosenSpecificity) {
        chosenSpecificity = spec;
        chosen = group;
      }
    }
  }
  if (!chosen) return true; // no applicable group => allowed

  let decision = true;
  let bestLen = -1;
  for (const rule of chosen.rules) {
    const len = matchRule(path, rule.path);
    if (len > bestLen) {
      bestLen = len;
      decision = rule.allow;
    }
  }
  return decision;
}

// --- live fetching with a small per-host cache ---

const cache = new Map<string, { parsed: ParsedRobots; fetchedAt: number }>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

export interface RobotsChecker {
  isAllowed(url: string): Promise<boolean>;
}

/** Default checker: fetches and caches robots.txt; fails open with a warning. */
export const robotsChecker: RobotsChecker = {
  async isAllowed(url: string): Promise<boolean> {
    if (!config.http.respectRobots) return true;
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return false;
    }
    const origin = target.origin;
    const cached = cache.get(origin);
    let parsed: ParsedRobots | undefined = cached?.parsed;

    if (!cached || Date.now() - cached.fetchedAt > TTL_MS) {
      try {
        const res = await fetch(`${origin}/robots.txt`, {
          headers: { 'user-agent': config.http.userAgent },
          signal: AbortSignal.timeout(config.http.timeoutMs),
        });
        if (res.ok) {
          parsed = parseRobots(await res.text());
        } else {
          // 4xx/5xx for robots => treat as no restrictions.
          parsed = { groups: [] };
        }
        cache.set(origin, { parsed, fetchedAt: Date.now() });
      } catch (err) {
        logger.warn('robots.txt fetch failed; failing open', {
          origin,
          error: (err as Error).message,
        });
        return true;
      }
    }
    if (!parsed) return true;
    return isPathAllowed(parsed, target.pathname + target.search, config.http.userAgent);
  },
};

/** Test helper: clears the in-memory robots cache. */
export function _clearRobotsCache(): void {
  cache.clear();
}
