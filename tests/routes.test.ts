import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(process.cwd(), '.test-routes');

let app: FastifyInstance;

function seedTestEnv() {
  process.env.MB_DATA_DIR = join(TEST_DIR, 'motherbrain');
  process.env.MB_STORAGE_DIR = join(TEST_DIR, 'storage');
  process.env.MB_AUTH_DISABLED = 'true';
  mkdirSync(join(TEST_DIR, 'storage', 'locks'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'motherbrain', 'checkpoints', 'v1'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'motherbrain', 'links', 'by-run'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'motherbrain', 'tree'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'motherbrain', 'snapshots'), { recursive: true });
}

describe('API routes', () => {
  beforeAll(async () => {
    seedTestEnv();
    const { buildApp } = await import('../src/api/server.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.MB_DATA_DIR;
    delete process.env.MB_STORAGE_DIR;
    delete process.env.MB_AUTH_DISABLED;
  });

  // ── Health ────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
      expect(body.version).toBe('v1');
    });
  });

  // ── Record Run ────────────────────────────────────────────────
  describe('POST /runs', () => {
    it('should record a valid checkpoint and return 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          agent: { id: 'agent_01', name: 'Test Agent' },
          intent: { goal: 'API test run' },
          result: { status: 'success', summary: 'All good' },
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.run_id).toMatch(/^run_/);
    });

    it('should return 400 for invalid payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: { invalid: true },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Upsert Node ───────────────────────────────────────────────
  describe('POST /nodes/upsert', () => {
    it('should upsert a valid node', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/nodes/upsert',
        payload: {
          id: 'task_test_001',
          type: 'task',
          title: 'Test Task',
          status: 'active',
          tags: ['test'],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.node_id).toBeDefined();
      expect(body.created).toBe(true);
    });

    it('should return 400 for invalid node', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/nodes/upsert',
        payload: { title: '' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Recall ────────────────────────────────────────────────────
  describe('GET /recall', () => {
    it('should return 400 when q is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/recall' });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('"q"');
    });

    it('should return recall results with valid query', async () => {
      const res = await app.inject({ method: 'GET', url: '/recall?q=test' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.query).toBe('test');
      expect(body.mode).toBeDefined();
    });
  });

  // ── Policy ────────────────────────────────────────────────────
  describe('POST /policy/check', () => {
    it('should allow a simple command', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/policy/check',
        payload: { cmd: 'ls' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.allowed).toBe(true);
    });

    it('should return 400 for invalid payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/policy/check',
        payload: 'not-json',
      });
      expect([400, 415]).toContain(res.statusCode);
    });
  });

  // ── Contexts CRUD ─────────────────────────────────────────────
  describe('Context routes', () => {
    it('POST /contexts should create a vertical context', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/contexts',
        payload: { name: 'api-test-vertical', scope: 'vertical' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('api-test-vertical');
      expect(body.scope).toBe('vertical');
    });

    it('GET /contexts should list contexts', async () => {
      const res = await app.inject({ method: 'GET', url: '/contexts' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it('GET /contexts/:id should look up by name', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/contexts/api-test-vertical',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('api-test-vertical');
    });

    it('GET /contexts/:id should return 404 for unknown', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/contexts/nonexistent_xyz',
      });
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /contexts/:id should return 400 for global', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/contexts/__global__',
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /contexts/current should return global by default', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/contexts/current',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.context_id).toBe('__global__');
    });
  });

  // ── Snapshot / Compact ────────────────────────────────────────
  describe('POST /snapshot', () => {
    it('should generate a snapshot', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/snapshot',
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.context_path).toBeDefined();
      expect(body.tasks_path).toBeDefined();
    });
  });

  describe('POST /compact', () => {
    it('should return result for a day with no runs', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/compact',
        payload: { day: '2020-01-01' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.runs_processed).toBe(0);
    });

    it('should return 400 for invalid day format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/compact',
        payload: { day: 'not-a-date' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});

describe('Auth middleware', () => {
  let authedApp: FastifyInstance;

  beforeAll(async () => {
    process.env.MB_TOKEN = 'test-secret-token';
    delete process.env.MB_AUTH_DISABLED;
    const { buildApp } = await import('../src/api/server.js');
    authedApp = await buildApp();
    await authedApp.ready();
  });

  afterAll(async () => {
    await authedApp.close();
    delete process.env.MB_TOKEN;
  });

  it('should allow /health without token', async () => {
    const res = await authedApp.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('should reject requests without token', async () => {
    const res = await authedApp.inject({ method: 'GET', url: '/recall?q=test' });
    expect(res.statusCode).toBe(401);
  });

  it('should reject requests with wrong token', async () => {
    const res = await authedApp.inject({
      method: 'GET',
      url: '/recall?q=test',
      headers: { 'x-mb-token': 'wrong-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should accept requests with correct token', async () => {
    const res = await authedApp.inject({
      method: 'GET',
      url: '/recall?q=test',
      headers: { 'x-mb-token': 'test-secret-token' },
    });
    expect(res.statusCode).toBe(200);
  });
});
