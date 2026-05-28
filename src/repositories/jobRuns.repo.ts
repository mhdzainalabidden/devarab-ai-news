import { query } from '../db/pool';
import type { JobRun } from '../types';

export interface JobRunUpdate {
  status?: JobRun['status'];
  sources_checked?: number;
  items_found?: number;
  items_inserted?: number;
  items_skipped?: number;
  errors?: number;
  detail?: Record<string, unknown> | null;
}

export async function startJobRun(jobName: string): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO job_runs (job_name, status) VALUES ($1, 'running') RETURNING id`,
    [jobName],
  );
  return rows[0]!.id;
}

export async function finishJobRun(id: number, update: JobRunUpdate): Promise<void> {
  await query(
    `
    UPDATE job_runs SET
      finished_at = now(),
      status = COALESCE($2, status),
      sources_checked = COALESCE($3, sources_checked),
      items_found = COALESCE($4, items_found),
      items_inserted = COALESCE($5, items_inserted),
      items_skipped = COALESCE($6, items_skipped),
      errors = COALESCE($7, errors),
      detail = COALESCE($8, detail)
    WHERE id = $1
    `,
    [
      id,
      update.status ?? null,
      update.sources_checked ?? null,
      update.items_found ?? null,
      update.items_inserted ?? null,
      update.items_skipped ?? null,
      update.errors ?? null,
      update.detail ? JSON.stringify(update.detail) : null,
    ],
  );
}

export async function recentJobRuns(limit = 10): Promise<JobRun[]> {
  const { rows } = await query<JobRun>(
    `SELECT * FROM job_runs ORDER BY started_at DESC LIMIT $1`,
    [Math.max(1, Math.min(100, limit))],
  );
  return rows;
}

export async function latestJobRun(jobName: string): Promise<JobRun | null> {
  const { rows } = await query<JobRun>(
    `SELECT * FROM job_runs WHERE job_name = $1 ORDER BY started_at DESC LIMIT 1`,
    [jobName],
  );
  return rows[0] ?? null;
}
