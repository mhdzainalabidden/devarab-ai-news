import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { config } from '../config';
import { logger } from '../logger';
import { type ApiDeps, defaultApiDeps } from './deps';
import { registerNewsRoutes } from './routes/news.routes';
import { registerAdminRoutes } from './routes/admin.routes';

export function buildServer(deps: ApiDeps = defaultApiDeps()): FastifyInstance {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  // Allow browser (client-side) calls from configured origins. No credentials
  // are used (admin auth is a header, not cookies), so reflecting origins is safe.
  app.register(cors, {
    origin: config.server.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-admin-key'],
    maxAge: 86_400,
  });

  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  registerNewsRoutes(app, deps);
  registerAdminRoutes(app, deps);

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: 'not found' });
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    logger.error('request error', {
      method: req.method,
      url: req.url,
      error: err.message,
    });
    reply.code(err.statusCode && err.statusCode >= 400 ? err.statusCode : 500).send({
      error: 'internal error',
    });
  });

  return app;
}
