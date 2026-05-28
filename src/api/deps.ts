import type { NewsItem, JobRun } from '../types';
import type { NewsListFilters } from '../repositories/newsQuery';
import type { CompanyOverview, UpsertSourceInput } from '../repositories/sources.repo';
import type { IngestionResult, RunOptions } from '../ingestion/orchestrator';
import type { Source } from '../types';

import * as newsRepo from '../repositories/newsItems.repo';
import * as sourcesRepo from '../repositories/sources.repo';
import * as jobsRepo from '../repositories/jobRuns.repo';
import { runIngestion } from '../ingestion/orchestrator';

/** Data + action dependencies the HTTP routes need. Injectable for testing. */
export interface ApiDeps {
  listNews: (filters: NewsListFilters) => Promise<NewsItem[]>;
  getNewsById: (id: number) => Promise<NewsItem | null>;
  digestItems: (sinceIso: string) => Promise<NewsItem[]>;
  companiesOverview: () => Promise<CompanyOverview[]>;
  upsertSource: (input: UpsertSourceInput) => Promise<Source>;
  runIngestion: (options: RunOptions) => Promise<IngestionResult>;
  recentJobRuns: (limit?: number) => Promise<JobRun[]>;
  latestJobRun: (jobName: string) => Promise<JobRun | null>;
}

export function defaultApiDeps(): ApiDeps {
  return {
    listNews: (filters) => newsRepo.listNews(filters),
    getNewsById: (id) => newsRepo.getNewsById(id),
    digestItems: (sinceIso) => newsRepo.digestItems(sinceIso),
    companiesOverview: () => sourcesRepo.companiesOverview(),
    upsertSource: (input) => sourcesRepo.upsertSource(input),
    runIngestion: (options) => runIngestion(options),
    recentJobRuns: (limit) => jobsRepo.recentJobRuns(limit),
    latestJobRun: (name) => jobsRepo.latestJobRun(name),
  };
}
