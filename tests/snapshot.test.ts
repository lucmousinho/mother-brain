import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { generateSnapshot } from '../src/core/snapshot.js';

const TEST_DIR = join(process.cwd(), '.test-snapshot');

let testDb: Database.Database;

function setupTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, agent_id TEXT NOT NULL,
      goal TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'success',
      tags_json TEXT NOT NULL DEFAULT '[]', raw_json TEXT NOT NULL,
      context_id TEXT NOT NULL DEFAULT '__global__'
    );
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
    CREATE INDEX IF NOT EXISTS idx_runs_context ON runs(context_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_context ON nodes(context_id);
  `);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at)
     VALUES ('__global__', 'Global', 'global', NULL, '__global__', ?, ?)`,
  ).run(now, now);
  return db;
}

describe('generateSnapshot', () => {
  beforeEach(() => {
    process.env.MB_DATA_DIR = join(TEST_DIR, 'motherbrain');
    process.env.MB_STORAGE_DIR = join(TEST_DIR, 'storage');
    mkdirSync(join(TEST_DIR, 'motherbrain', 'snapshots'), { recursive: true });
    testDb = setupTestDb();
  });

  afterEach(() => {
    testDb.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.MB_DATA_DIR;
    delete process.env.MB_STORAGE_DIR;
  });

  it('should generate snapshot files from empty db', () => {
    const result = generateSnapshot(testDb);
    expect(result.total_nodes).toBe(0);
    expect(result.total_runs).toBe(0);
    expect(result.active_tasks).toBe(0);
    expect(existsSync(result.context_path)).toBe(true);
    expect(existsSync(result.tasks_path)).toBe(true);
  });

  it('should count nodes and runs', () => {
    const node = {
      id: 'task_s1', type: 'task', title: 'Do stuff', status: 'active',
      tags: ['test'], owners: [], constraints: [], body: '', refs: { runs: [], files: [] },
      next_actions: ['action1'],
    };
    testDb.prepare(
      `INSERT INTO nodes (node_id, type, title, status, tags_json, raw_json, context_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('task_s1', 'task', 'Do stuff', 'active', '["test"]', JSON.stringify(node), '__global__');

    testDb.prepare(
      `INSERT INTO runs (run_id, timestamp, agent_id, goal, summary, status, tags_json, raw_json, context_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('run_s1', new Date().toISOString(), 'a1', 'Goal', 'Sum', 'success', '[]', '{}', '__global__');

    const result = generateSnapshot(testDb);
    expect(result.total_nodes).toBe(1);
    expect(result.total_runs).toBe(1);
    expect(result.active_tasks).toBe(1);
  });

  it('should filter by context_id', () => {
    const now = new Date().toISOString();
    testDb.prepare(
      `INSERT INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at)
       VALUES ('ctx_v1', 'V1', 'vertical', '__global__', '__global__/ctx_v1', ?, ?)`,
    ).run(now, now);

    const node = {
      id: 'task_scoped', type: 'task', title: 'Scoped', status: 'active',
      tags: [], owners: [], constraints: [], body: '', refs: { runs: [], files: [] },
      next_actions: [],
    };
    testDb.prepare(
      `INSERT INTO nodes (node_id, type, title, status, tags_json, raw_json, context_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('task_scoped', 'task', 'Scoped', 'active', '[]', JSON.stringify(node), 'ctx_v1');

    testDb.prepare(
      `INSERT INTO nodes (node_id, type, title, status, tags_json, raw_json, context_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('task_other', 'task', 'Other', 'active', '[]', JSON.stringify({ ...node, id: 'task_other' }), 'ctx_other');

    const result = generateSnapshot(testDb, 'ctx_v1');
    expect(result.total_nodes).toBe(1);
  });
});
