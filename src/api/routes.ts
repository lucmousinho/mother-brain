import type { FastifyInstance } from 'fastify';
import { recordCheckpoint } from '../core/checkpoint.js';
import { upsertNode } from '../core/tree.js';
import { recall } from '../core/recall.js';
import { policyCheck } from '../core/policy.js';
import { PolicyCheckSchema } from '../core/schemas.js';
import { ZodError } from 'zod';

function formatZodError(err: ZodError): string {
  return err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

export function registerRoutes(app: FastifyInstance): void {
  // ── Health ─────────────────────────────────────────────────────
  app.get('/health', async () => {
    return { status: 'ok', version: 'v1', timestamp: new Date().toISOString() };
  });

  // ── Record Run Checkpoint ──────────────────────────────────────
  app.post('/runs', async (request, reply) => {
    try {
      const result = await recordCheckpoint(request.body);
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: formatZodError(err) });
      }
      throw err;
    }
  });

  // ── Upsert Node ────────────────────────────────────────────────
  app.post('/nodes/upsert', async (request, reply) => {
    try {
      const result = await upsertNode(request.body);
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: formatZodError(err) });
      }
      throw err;
    }
  });

  // ── Recall ─────────────────────────────────────────────────────
  app.get<{ Querystring: { q?: string; limit?: string; tags?: string; types?: string } }>(
    '/recall',
    async (request, reply) => {
      const q = request.query.q;
      if (!q) {
        return reply.code(400).send({ error: 'Query parameter "q" is required' });
      }

      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;
      const tags = request.query.tags ? request.query.tags.split(',') : undefined;
      const nodeTypes = request.query.types ? request.query.types.split(',') : undefined;

      const result = recall(q, limit, tags, nodeTypes);
      return result;
    },
  );

  // ── Policy Check ───────────────────────────────────────────────
  app.post('/policy/check', async (request, reply) => {
    try {
      const parsed = PolicyCheckSchema.parse(request.body);
      const result = policyCheck(parsed);
      const statusCode = result.allowed ? 200 : 403;
      return reply.code(statusCode).send(result);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: formatZodError(err) });
      }
      throw err;
    }
  });
}
