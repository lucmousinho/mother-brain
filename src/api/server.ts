import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from './routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: 'info',
    },
  });

  // Token auth middleware
  const token = process.env.MB_TOKEN;
  if (token) {
    app.addHook('onRequest', async (request, reply) => {
      // Skip auth for health endpoint
      if (request.url === '/health') return;

      const reqToken = request.headers['x-mb-token'];
      if (reqToken !== token) {
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
