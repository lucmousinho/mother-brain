import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { upsertNode, getNode, listNodes } from '../src/core/tree.js';

const TEST_DIR = join(process.cwd(), '.test-tree');

let testDb: Database.Database;

function setupTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      node_id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', tags_json TEXT NOT NULL DEFAULT '[]',
      raw_md TEXT NOT NULL DEFAULT '', raw_json TEXT NOT NULL DEFAULT '{}',
      context_id TEXT NOT NULL DEFAULT '__global__'
    );
    CREATE TABLE IF NOT EXISTS contexts (
      context_id TEXT PRIMARY KEY, name TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('global', 'vertical', 'project')),
      parent_id TEXT, scope_path TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_nodes_context ON nodes(context_id);
  `);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at)
     VALUES ('__global__', 'Global', 'global', NULL, '__global__', ?, ?)`,
  ).run(now, now);
  return db;
}

describe('tree', () => {
  beforeEach(() => {
    process.env.MB_DATA_DIR = join(TEST_DIR, 'motherbrain');
    process.env.MB_STORAGE_DIR = join(TEST_DIR, 'storage');
    mkdirSync(join(TEST_DIR, 'storage', 'locks'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'motherbrain', 'tree', 'tasks'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'motherbrain', 'tree', 'patterns'), { recursive: true });
    testDb = setupTestDb();
  });

  afterEach(() => {
    testDb.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.MB_DATA_DIR;
    delete process.env.MB_STORAGE_DIR;
  });

  describe('upsertNode', () => {
    it('should create a new node', async () => {
      const result = await upsertNode(
        { id: 'task_t1', type: 'task', title: 'Test Task', status: 'active', tags: ['t'] },
        testDb,
      );
      expect(result.node_id).toBe('task_t1');
      expect(result.created).toBe(true);
    });

    it('should update an existing node', async () => {
      await upsertNode(
        { id: 'task_t2', type: 'task', title: 'V1', status: 'active', tags: [] },
        testDb,
      );
      const result = await upsertNode(
        { id: 'task_t2', type: 'task', title: 'V2', status: 'done', tags: [] },
        testDb,
      );
      expect(result.created).toBe(false);
    });

    it('should resolve context name to ID', async () => {
      const now = new Date().toISOString();
      testDb.prepare(
        `INSERT INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at)
         VALUES ('ctx_v1', 'my-vertical', 'vertical', '__global__', '__global__/ctx_v1', ?, ?)`,
      ).run(now, now);

      await upsertNode(
        { id: 'task_t3', type: 'task', title: 'Scoped', status: 'active', tags: [] },
        testDb,
        'my-vertical',
      );

      const row = testDb.prepare('SELECT context_id FROM nodes WHERE node_id = ?').get('task_t3') as { context_id: string };
      expect(row.context_id).toBe('ctx_v1');
    });
  });

  describe('getNode', () => {
    it('should return null for non-existent node', () => {
      expect(getNode('nonexistent', testDb)).toBeNull();
    });

    it('should return node by ID', async () => {
      await upsertNode(
        { id: 'task_g1', type: 'task', title: 'Get Me', status: 'active', tags: [] },
        testDb,
      );
      const node = getNode('task_g1', testDb);
      expect(node).not.toBeNull();
      expect(node!.title).toBe('Get Me');
    });

    it('should enforce scope check when contextIds provided', async () => {
      await upsertNode(
        { id: 'task_scoped', type: 'task', title: 'Scoped', status: 'active', tags: [] },
        testDb,
        'ctx_other',
      );

      const withScope = getNode('task_scoped', testDb, ['__global__']);
      expect(withScope).toBeNull();

      const withoutScope = getNode('task_scoped', testDb);
      expect(withoutScope).not.toBeNull();
    });
  });

  describe('listNodes', () => {
    it('should list all nodes', async () => {
      await upsertNode({ id: 'task_l1', type: 'task', title: 'T1', status: 'active', tags: [] }, testDb);
      await upsertNode({ id: 'task_l2', type: 'task', title: 'T2', status: 'done', tags: [] }, testDb);

      const nodes = listNodes(undefined, undefined, testDb);
      expect(nodes.length).toBe(2);
    });

    it('should filter by type', async () => {
      await upsertNode({ id: 'task_f1', type: 'task', title: 'T', status: 'active', tags: [] }, testDb);
      await upsertNode({ id: 'pattern_f1', type: 'pattern', title: 'P', status: 'active', tags: [] }, testDb);

      const tasks = listNodes('task', undefined, testDb);
      expect(tasks.length).toBe(1);
      expect(tasks[0].type).toBe('task');
    });

    it('should filter by contextIds', async () => {
      await upsertNode({ id: 'task_c1', type: 'task', title: 'C1', status: 'active', tags: [] }, testDb, 'ctx_a');
      await upsertNode({ id: 'task_c2', type: 'task', title: 'C2', status: 'active', tags: [] }, testDb, 'ctx_b');

      const filtered = listNodes(undefined, undefined, testDb, ['ctx_a']);
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('task_c1');
    });
  });
});
