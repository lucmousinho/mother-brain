import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { recordCheckpoint } from '../src/core/checkpoint.js';

const TEST_DIR = join(process.cwd(), '.test-record');

let testDb: Database.Database;

describe('recordCheckpoint', () => {
  beforeEach(() => {
    process.env.MB_DATA_DIR = join(TEST_DIR, 'motherbrain');
    process.env.MB_STORAGE_DIR = join(TEST_DIR, 'storage');

    mkdirSync(join(TEST_DIR, 'storage', 'locks'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'motherbrain', 'checkpoints', 'v1'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'motherbrain', 'links', 'by-run'), { recursive: true });

    testDb = new Database(':memory:');
    testDb.exec(`
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
    `);
    const now = new Date().toISOString();
    testDb.prepare(
      `INSERT OR IGNORE INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at)
       VALUES ('__global__', 'Global', 'global', NULL, '__global__', ?, ?)`
    ).run(now, now);
  });

  afterEach(() => {
    testDb.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.MB_DATA_DIR;
    delete process.env.MB_STORAGE_DIR;
  });

  it('should record a valid checkpoint', async () => {
    const input = {
      agent: { id: 'agent_01', name: 'Test' },
      intent: { goal: 'Test recording' },
      result: { status: 'success', summary: 'Tested' },
    };

    const result = await recordCheckpoint(input, testDb);

    expect(result.run_id).toMatch(/^run_/);
    expect(existsSync(result.file_path)).toBe(true);

    // Check DB
    const row = testDb.prepare('SELECT * FROM runs WHERE run_id = ?').get(result.run_id) as {
      run_id: string;
      goal: string;
    };
    expect(row).toBeDefined();
    expect(row.goal).toBe('Test recording');
  });

  it('should use provided run_id', async () => {
    const input = {
      run_id: 'run_custom123',
      agent: { id: 'agent_01', name: 'Test' },
      intent: { goal: 'Custom ID' },
      result: { status: 'success', summary: 'OK' },
    };

    const result = await recordCheckpoint(input, testDb);
    expect(result.run_id).toBe('run_custom123');
  });

  it('should reject invalid input', async () => {
    const input = { invalid: true };
    await expect(recordCheckpoint(input, testDb)).rejects.toThrow();
  });

  it('should link nodes when provided', async () => {
    const input = {
      agent: { id: 'agent_01', name: 'Test' },
      intent: { goal: 'With links' },
      result: { status: 'success', summary: 'Linked' },
      links: { nodes: ['task_001', 'task_002'] },
    };

    const result = await recordCheckpoint(input, testDb);
    expect(result.linked_nodes).toEqual(['task_001', 'task_002']);

    const links = testDb.prepare('SELECT * FROM links WHERE run_id = ?').all(result.run_id);
    expect(links.length).toBe(2);
  });
});
