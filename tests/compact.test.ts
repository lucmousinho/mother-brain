import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { compactDay } from '../src/core/compact.js';

const TEST_DIR = join(process.cwd(), '.test-compact');

let testDb: Database.Database;

function setupTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      goal TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'success',
      tags_json TEXT NOT NULL DEFAULT '[]',
      raw_json TEXT NOT NULL,
      context_id TEXT NOT NULL DEFAULT '__global__'
    );
    CREATE TABLE IF NOT EXISTS nodes (
      node_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      tags_json TEXT NOT NULL DEFAULT '[]',
      raw_md TEXT NOT NULL DEFAULT '',
      raw_json TEXT NOT NULL DEFAULT '{}',
      context_id TEXT NOT NULL DEFAULT '__global__'
    );
    CREATE TABLE IF NOT EXISTS links (
      run_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      PRIMARY KEY (run_id, node_id)
    );
    CREATE TABLE IF NOT EXISTS contexts (
      context_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('global', 'vertical', 'project')),
      parent_id TEXT,
      scope_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
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

describe('compactDay', () => {
  beforeEach(() => {
    process.env.MB_DATA_DIR = join(TEST_DIR, 'motherbrain');
    process.env.MB_STORAGE_DIR = join(TEST_DIR, 'storage');
    mkdirSync(join(TEST_DIR, 'storage', 'locks'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'motherbrain', 'checkpoints', 'v1'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'motherbrain', 'tree', 'patterns'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'motherbrain', 'snapshots'), { recursive: true });
    testDb = setupTestDb();
  });

  afterEach(() => {
    testDb.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.MB_DATA_DIR;
    delete process.env.MB_STORAGE_DIR;
  });

  it('should return empty result for day with no runs', async () => {
    const result = await compactDay('2025-01-01', testDb);
    expect(result.runs_processed).toBe(0);
    expect(result.patterns_created).toEqual([]);
    expect(result.summary_path).toBe('');
  });

  it('should reject invalid day format', async () => {
    await expect(compactDay('bad', testDb)).rejects.toThrow('Invalid day format');
  });

  it('should compact runs from DB', async () => {
    const day = '2025-06-15';
    const run1 = {
      version: 'v1',
      run_id: 'run_c1',
      timestamp: `${day}T10:00:00.000Z`,
      agent: { id: 'a1', name: 'Agent' },
      intent: { goal: 'Goal 1', context: [] },
      plan: [],
      actions: [],
      files_touched: [],
      artifacts: [],
      result: { status: 'success', summary: 'Done' },
      constraints_applied: [],
      risk_flags: [],
      links: { nodes: [] },
      tags: ['test'],
    };
    const run2 = { ...run1, run_id: 'run_c2', intent: { goal: 'Goal 2', context: [] } };

    testDb.prepare(
      `INSERT INTO runs (run_id, timestamp, agent_id, goal, summary, status, tags_json, raw_json, context_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(run1.run_id, run1.timestamp, 'a1', 'Goal 1', 'Done', 'success', '["test"]', JSON.stringify(run1), '__global__');

    testDb.prepare(
      `INSERT INTO runs (run_id, timestamp, agent_id, goal, summary, status, tags_json, raw_json, context_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(run2.run_id, run2.timestamp, 'a1', 'Goal 2', 'Done', 'success', '["test"]', JSON.stringify(run2), '__global__');

    const result = await compactDay(day, testDb);
    expect(result.runs_processed).toBe(2);
    expect(result.patterns_created.length).toBe(1);
    expect(result.summary_path).toContain('daily_summary');
  });

  it('should skip malformed checkpoint files', async () => {
    const day = '2025-06-20';
    const dayDir = join(TEST_DIR, 'motherbrain', 'checkpoints', 'v1', '2025', '06');
    mkdirSync(dayDir, { recursive: true });
    writeFileSync(join(dayDir, 'bad.json'), 'NOT VALID JSON', 'utf-8');

    const result = await compactDay(day, testDb);
    expect(result.runs_processed).toBe(0);
  });

  it('should filter by context when provided', async () => {
    const day = '2025-07-01';
    const now = new Date().toISOString();
    testDb.prepare(
      `INSERT INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at)
       VALUES ('ctx_v1', 'Vertical', 'vertical', '__global__', '__global__/ctx_v1', ?, ?)`,
    ).run(now, now);

    const run1 = {
      version: 'v1', run_id: 'run_ctx1', timestamp: `${day}T10:00:00.000Z`,
      agent: { id: 'a1', name: 'A' }, intent: { goal: 'G1', context: [] },
      plan: [], actions: [], files_touched: [], artifacts: [],
      result: { status: 'success', summary: 'OK' },
      constraints_applied: [], risk_flags: [], links: { nodes: [] }, tags: [],
    };

    testDb.prepare(
      `INSERT INTO runs (run_id, timestamp, agent_id, goal, summary, status, tags_json, raw_json, context_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('run_ctx1', run1.timestamp, 'a1', 'G1', 'OK', 'success', '[]', JSON.stringify(run1), 'ctx_v1');

    testDb.prepare(
      `INSERT INTO runs (run_id, timestamp, agent_id, goal, summary, status, tags_json, raw_json, context_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('run_other', run1.timestamp, 'a1', 'G2', 'OK', 'success', '[]', JSON.stringify({ ...run1, run_id: 'run_other' }), 'ctx_other');

    const result = await compactDay(day, testDb, 'ctx_v1');
    expect(result.runs_processed).toBe(1);
  });
});
