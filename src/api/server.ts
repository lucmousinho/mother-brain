import 'dotenv/config';
import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from './routes.js';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = parseInt(process.env.MB_RATE_LIMIT_MAX || '100', 10);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: 'info',
    },
  });

  // CORS support
  const allowedOrigin = process.env.MB_CORS_ORIGIN || '*';
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', allowedOrigin);
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-MB-TOKEN, X-MB-CONTEXT');

    if (request.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });

  // Rate limiting
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;
    const ip = request.ip;
    if (!checkRateLimit(ip)) {
      reply.code(429).send({ error: 'Too many requests. Try again later.' });
    }
  });

  // Token auth middleware — MB_TOKEN is required unless explicitly disabled
  const token = process.env.MB_TOKEN;
  if (!token && process.env.MB_AUTH_DISABLED !== 'true') {
    throw new Error(
      'MB_TOKEN environment variable is required. Set MB_AUTH_DISABLED=true to explicitly disable authentication (not recommended).',
    );
  }

  if (token) {
    app.addHook('onRequest', async (request, reply) => {
      if (request.url === '/health') return;
      if (request.method === 'OPTIONS') return;

      const reqToken = request.headers['x-mb-token'];
      if (typeof reqToken !== 'string' || !safeEqual(reqToken, token)) {
        reply.code(401).send({ error: 'Unauthorized: invalid or missing X-MB-TOKEN' });
      }
    });
  }

  registerRoutes(app);

  return app;
}

// Direct execution
const isDirectRun =
  process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isDirectRun) {
  const port = parseInt(process.env.MB_API_PORT || '7337', 10);
  const app = await buildApp();
  await app.listen({ port, host: '127.0.0.1' });
  console.log(`Mother Brain API listening on http://127.0.0.1:${port}`);
}
