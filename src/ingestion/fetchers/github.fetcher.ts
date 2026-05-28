import type { RawEntry, Source, GithubFetchConfig } from '../../types';
import { config } from '../../config';
import { fetchJson } from '../http';

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (config.github.token) h.authorization = `Bearer ${config.github.token}`;
  return h;
}

interface GhRelease {
  html_url: string;
  name: string | null;
  tag_name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
}

interface GhCommit {
  html_url: string;
  sha: string;
  commit: { message: string; committer?: { date?: string } | null };
}

/** Fetch GitHub releases, commits, or a tracked changelog file as raw entries. */
export async function fetchGithub(source: Source, limit: number): Promise<RawEntry[]> {
  const cfg = source.extra?.github;
  if (!cfg) {
    throw new Error(`source ${source.id} is type 'github' but has no extra.github config`);
  }
  const mode = cfg.mode ?? 'releases';
  switch (mode) {
    case 'releases':
      return fetchReleases(cfg, limit);
    case 'commits':
      return fetchCommits(cfg, limit);
    case 'file':
      return fetchFile(cfg);
    default:
      throw new Error(`unknown github mode '${mode}'`);
  }
}

async function fetchReleases(cfg: GithubFetchConfig, limit: number): Promise<RawEntry[]> {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases?per_page=${Math.min(limit, 30)}`;
  const releases = await fetchJson<GhRelease[]>(url, { headers: authHeaders() });
  return releases
    .filter((r) => !r.draft)
    .slice(0, limit)
    .map((r) => ({
      title: r.name?.trim() || r.tag_name,
      url: r.html_url,
      content: r.body?.trim() || r.name || r.tag_name,
      publishedAt: r.published_at,
    }));
}

async function fetchCommits(cfg: GithubFetchConfig, limit: number): Promise<RawEntry[]> {
  const branchQs = cfg.branch ? `&sha=${encodeURIComponent(cfg.branch)}` : '';
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits?per_page=${Math.min(limit, 30)}${branchQs}`;
  const commits = await fetchJson<GhCommit[]>(url, { headers: authHeaders() });
  return commits.slice(0, limit).map((c) => {
    const message = c.commit.message ?? '';
    const firstLine = message.split('\n')[0] ?? c.sha.slice(0, 7);
    return {
      title: firstLine,
      url: c.html_url,
      content: message,
      publishedAt: c.commit.committer?.date ?? null,
    };
  });
}

async function fetchFile(cfg: GithubFetchConfig): Promise<RawEntry[]> {
  if (!cfg.path) throw new Error('github file mode requires extra.github.path');
  const ref = cfg.branch ? `?ref=${encodeURIComponent(cfg.branch)}` : '';
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}${ref}`;
  const file = await fetchJson<{ content: string; encoding: string; html_url: string }>(url, {
    headers: authHeaders(),
  });
  const decoded =
    file.encoding === 'base64' ? Buffer.from(file.content, 'base64').toString('utf8') : file.content;
  // Surface the changelog file as a single entry; the orchestrator hashes the
  // full body, so any change to the file produces a new (reviewable) item.
  return [
    {
      title: `${cfg.repo} ${cfg.path} updated`,
      url: file.html_url,
      content: decoded,
      publishedAt: null,
    },
  ];
}
