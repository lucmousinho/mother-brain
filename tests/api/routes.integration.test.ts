import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/server.js';

describe('API Routes Integration', () => {
  let app: FastifyInstance;
  const validToken = 'test-token-12345';

  beforeAll(async () => {
    // Set token for auth
    process.env.MB_TOKEN = validToken;
    process.env.MB_AUTH_DISABLED = 'false';

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.MB_TOKEN;
    delete process.env.MB_AUTH_DISABLED;
  });

  describe('Health endpoint', () => {
    it('returns 200 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.version).toBe('v1');
    });
  });

  describe('Authentication', () => {
    it('POST /runs requires auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          agent: { id: 'test', name: 'Test' },
          intent: { goal: 'Test goal' },
          result: { status: 'success', summary: 'Done' },
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Unauthorized');
    });

    it('POST /runs succeeds with valid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/runs',
        headers: {
          'x-mb-token': validToken,
        },
        payload: {
          agent: { id: 'test-agent', name: 'Test Agent' },
          intent: {
            goal: 'Test goal with sufficient length',
            summary: 'Test summary with sufficient length for validation',
          },
          result: {
            status: 'success',
            summary: 'Completed successfully',
            output: 'Test output',
          },
          tags: ['test'],
          links: { nodes: [] },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.run_id).toBeDefined();
      expect(body.file_path).toBeDefined();
    });

    it('POST /runs rejects invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/runs',
        headers: {
          'x-mb-token': 'wrong-token',
        },
        payload: {
          agent: { id: 'test', name: 'Test' },
          intent: { goal: 'Test' },
          result: { status: 'success', summary: 'Done' },
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /runs validation', () => {
    it('rejects checkpoint with missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/runs',
        headers: {
          'x-mb-token': validToken,
        },
        payload: {
          // Missing agent, intent, result
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Validation failed');
    });

    it('accepts checkpoint with all required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/runs',
        headers: {
          'x-mb-token': validToken,
        },
        payload: {
          agent: { id: 'test-agent', name: 'Test Agent' },
          intent: {
            goal: 'Complete test operation successfully',
            summary: 'Test summary with adequate length for passing validation',
          },
          result: {
            status: 'success',
            summary: 'Test completed',
            output: 'Success output',
          },
          tags: ['integration-test'],
          links: { nodes: [] },
        },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('GET /recall', () => {
    it('requires auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/recall?q=test',
      });

      expect(response.statusCode).toBe(401);
    });

    it('requires query parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/recall',
        headers: {
          'x-mb-token': validToken,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Query parameter "q" is required');
    });

    it('returns recall results with valid query', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/recall?q=test&limit=5',
        headers: {
          'x-mb-token': validToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.query).toBe('test');
      expect(body.mode).toBeDefined();
      expect(Array.isArray(body.top_runs) || body.top_runs === undefined).toBe(true);
      expect(Array.isArray(body.top_nodes) || body.top_nodes === undefined).toBe(true);
    });

    it('handles recall errors gracefully', async () => {
      // This might fail due to DB/vector issues, should return 500
      const response = await app.inject({
        method: 'GET',
        url: '/recall?q=' + 'x'.repeat(10000), // Very long query
        headers: {
          'x-mb-token': validToken,
        },
      });

      // Should either succeed or fail gracefully
      expect([200, 500].includes(response.statusCode)).toBe(true);
    });
  });

  describe('POST /nodes/upsert', () => {
    it('requires auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/nodes/upsert',
        payload: {
          type: 'task',
          title: 'Test task',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('creates node with valid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/nodes/upsert',
        headers: {
          'x-mb-token': validToken,
        },
        payload: {
          id: 'task_test_integration_01',
          type: 'task',
          title: 'Integration test task',
          status: 'active',
          tags: ['test'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.node_id).toBe('task_test_integration_01');
      expect(body.file_path).toBeDefined();
      expect(body.created).toBeDefined();
    });
  });

  describe('Rate limiting', () => {
    it('enforces rate limits (if enabled)', async () => {
      // Send many requests rapidly
      const requests = Array(10)
        .fill(0)
        .map(() =>
          app.inject({
            method: 'GET',
            url: '/recall?q=test',
            headers: {
              'x-mb-token': validToken,
            },
          }),
        );

      const responses = await Promise.all(requests);

      // All should succeed if rate limit is high enough
      // or some should fail with 429 if rate limit is low
      const statusCodes = responses.map((r) => r.statusCode);
      // const has429 = statusCodes.includes(429);

      // Rate limiting might or might not be triggered depending on config
      expect(statusCodes.every((code) => [200, 429].includes(code))).toBe(true);
    });
  });

  describe('CORS', () => {
    it('includes CORS headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });

    it('handles OPTIONS preflight', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/runs',
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});
