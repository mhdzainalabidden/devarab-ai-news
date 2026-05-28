import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ApiDeps } from '../deps';
import { config } from '../../config';
import { SOURCE_TYPES } from '../../types';
import { isIngestionRunning, withIngestionLock } from '../../ingestion/runLock';

const sourceSchema = z.object({
  company: z.string().min(1),
  product: z.string().min(1).nullish(),
  source_url: z.string().url(),
  source_type: z.enum(SOURCE_TYPES),
  official_domain: z.string().min(1),
  priority: z.number().int().min(0).max(1000).optional(),
  crawl_interval_minutes: z.number().int().min(1).max(10080).optional(),
  active: z.boolean().optional(),
  extra: z
    .object({
      html: z
        .object({
          itemSelector: z.string().min(1),
          titleSelector: z.string().optional(),
          linkSelector: z.string().optional(),
          linkAttr: z.string().optional(),
          dateSelector: z.string().optional(),
          contentSelector: z.string().optional(),
          baseUrl: z.string().url().optional(),
        })
        .optional(),
      github: z
        .object({
          owner: z.string().min(1),
          repo: z.string().min(1),
          mode: z.enum(['releases', 'commits', 'file']).optional(),
          path: z.string().optional(),
          branch: z.string().optional(),
        })
        .optional(),
    })
    .nullish(),
});

const runSchema = z.object({
  force: z.boolean().optional(),
  sourceIds: z.array(z.number().int().positive()).optional(),
  async: z.boolean().optional(),
});

function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.server.adminApiKey) {
    reply.code(503).send({ error: 'admin endpoints disabled: set ADMIN_API_KEY' });
    return false;
  }
  const provided = req.headers['x-admin-key'];
  if (provided !== config.server.adminApiKey) {
    reply.code(401).send({ error: 'unauthorized' });
    return false;
  }
  return true;
}

export function registerAdminRoutes(app: FastifyInstance, deps: ApiDeps): void {
  // POST /api/admin/sources — add or update an official source.
  app.post('/api/admin/sources', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = sourceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid source', issues: parsed.error.issues });
    }
    const source = await deps.upsertSource({
      ...parsed.data,
      product: parsed.data.product ?? null,
      extra: parsed.data.extra ?? null,
    });
    return reply.code(200).send({ source });
  });

  // POST /api/admin/run-ingestion — manually trigger an ingestion pass.
  app.post('/api/admin/run-ingestion', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = runSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid options', issues: parsed.error.issues });
    }
    if (isIngestionRunning()) {
      return reply.code(409).send({ error: 'ingestion already running' });
    }

    const options = { force: parsed.data.force, sourceIds: parsed.data.sourceIds };

    if (parsed.data.async) {
      void withIngestionLock(() => deps.runIngestion(options)).catch(() => {});
      return reply.code(202).send({ accepted: true });
    }

    const result = await withIngestionLock(() => deps.runIngestion(options));
    return reply.code(200).send({ result });
  });

  // GET /api/admin/health — job health for monitoring (also admin-guarded).
  app.get('/api/admin/health', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const latest = await deps.latestJobRun('ingestion');
    const recent = await deps.recentJobRuns(10);
    const lastSuccess = recent.find((r) => r.status === 'success' || r.status === 'partial');
    return {
      latest,
      recent,
      last_success_at: lastSuccess?.finished_at ?? null,
      healthy: latest ? latest.status !== 'failed' : true,
    };
  });
}
