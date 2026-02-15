import type { FastifyInstance } from 'fastify';
import { recordCheckpoint } from '../core/checkpoint.js';
import { upsertNode } from '../core/tree.js';
import { recall, type RecallMode } from '../core/recall.js';
import { policyCheck } from '../core/policy.js';
import { PolicyCheckSchema } from '../core/schemas.js';
import { ZodError } from 'zod';
import { createContext, getContext, listContexts } from '../core/context/context.manager.js';
import {
  getActiveContext,
  setActiveContext,
  getAncestorChain,
} from '../core/context/context.resolver.js';
import type { ContextScope } from '../core/context/context.types.js';

function formatZodError(err: ZodError): string {
  return err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

function extractContextFromRequest(request: {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}): string | undefined {
  // Check body first
  if (request.body && typeof request.body === 'object' && 'context_id' in request.body) {
    const bodyCtx = (request.body as Record<string, unknown>).context_id;
    if (typeof bodyCtx === 'string' && bodyCtx) return bodyCtx;
  }

  // Fallback to header
  const headerCtx = request.headers['x-mb-context'];
  if (typeof headerCtx === 'string' && headerCtx) return headerCtx;

  return undefined;
}

export function registerRoutes(app: FastifyInstance): void {
  // ── Health ─────────────────────────────────────────────────────
  app.get('/health', async () => {
    return { status: 'ok', version: 'v1', timestamp: new Date().toISOString() };
  });

  // ── Record Run Checkpoint ──────────────────────────────────────
  app.post('/runs', async (request, reply) => {
    try {
      const contextId = extractContextFromRequest(request);
      const result = await recordCheckpoint(request.body, undefined, contextId);
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
      const contextId = extractContextFromRequest(request);
      const result = await upsertNode(request.body, undefined, contextId);
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: formatZodError(err) });
      }
      throw err;
    }
  });

  // ── Recall ─────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      q?: string;
      limit?: string;
      tags?: string;
      types?: string;
      mode?: string;
      context_id?: string;
      context_ids?: string;
    };
  }>('/recall', async (request, reply) => {
    const q = request.query.q;
    if (!q) {
      return reply.code(400).send({ error: 'Query parameter "q" is required' });
    }

    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;
    const tags = request.query.tags ? request.query.tags.split(',') : undefined;
    const nodeTypes = request.query.types ? request.query.types.split(',') : undefined;
    const mode = validateMode(request.query.mode);

    // Context from query params or header
    const contextId =
      request.query.context_id ||
      (typeof request.headers['x-mb-context'] === 'string'
        ? request.headers['x-mb-context']
        : undefined);
    const contextIds = request.query.context_ids
      ? request.query.context_ids.split(',')
      : undefined;

    const result = await recall(q, limit, tags, nodeTypes, undefined, mode, contextId, contextIds);
    return result;
  });

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

  // ── Context CRUD ───────────────────────────────────────────────

  app.post<{
    Body: { name: string; scope: string; parent_id?: string; metadata?: Record<string, unknown> };
  }>('/contexts', async (request, reply) => {
    try {
      const context = await createContext({
        name: request.body.name,
        scope: request.body.scope as Exclude<ContextScope, 'global'>,
        parent_id: request.body.parent_id,
        metadata: request.body.metadata,
      });
      return reply.code(201).send(context);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: formatZodError(err) });
      }
      if (err instanceof Error) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get<{
    Querystring: { scope?: string; parent?: string };
  }>('/contexts', async (request) => {
    const contexts = listContexts(
      request.query.scope as ContextScope | undefined,
      request.query.parent,
    );
    return contexts;
  });

  app.get('/contexts/current', async () => {
    const active = getActiveContext();
    if (!active) {
      return { context_id: '__global__', name: 'Global', scope: 'global', scope_path: '__global__' };
    }
    const chain = getAncestorChain(active.context_id);
    return { ...active, ancestor_chain: chain };
  });

  app.put<{
    Body: { context_id: string };
  }>('/contexts/current', async (request, reply) => {
    try {
      const info = await setActiveContext(request.body.context_id);
      return reply.code(200).send(info);
    } catch (err) {
      if (err instanceof Error) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get<{
    Params: { id: string };
  }>('/contexts/:id', async (request, reply) => {
    const context = getContext(request.params.id);
    if (!context) {
      return reply.code(404).send({ error: 'Context not found' });
    }
    return context;
  });
}

function validateMode(mode?: string): RecallMode | undefined {
  if (mode === 'keyword' || mode === 'semantic' || mode === 'hybrid') return mode;
  return undefined;
}
