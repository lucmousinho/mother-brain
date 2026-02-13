import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { recallKeyword, type RecallResult } from '../src/core/recall.js';

const TEST_DIR = join(process.cwd(), '.test-recall-semantic');

let testDb: Database.Database;

describe('recall engine — keyword mode (regression)', () => {
  beforeEach(() => {
    process.env.MB_DATA_DIR = join(TEST_DIR, 'motherbrain');
    process.env.MB_STORAGE_DIR = join(TEST_DIR, 'storage');

    mkdirSync(join(TEST_DIR, 'storage', 'locks'), { recursive: true });

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
        raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS nodes (
        node_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        tags_json TEXT NOT NULL DEFAULT '[]',
        raw_md TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS links (
        run_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        PRIMARY KEY (run_id, node_id)
      );
    `);

    // Seed data
    testDb.prepare(`INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'run_deploy_001',
      new Date().toISOString(),
      'agent_coder',
      'Deploy staging environment',
      'Deployed successfully',
      'success',
      '["deploy","staging"]',
      '{}',
    );

    testDb.prepare(`INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'run_auth_001',
      new Date().toISOString(),
      'agent_coder',
      'Fix authentication bug',
      'Fixed JWT validation',
      'success',
      '["auth","bugfix"]',
      '{}',
    );

    testDb.prepare(`INSERT INTO nodes VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'task_deploy_staging',
      'task',
      'Deploy staging environment',
      'active',
      '["deploy","staging"]',
      '',
      JSON.stringify({
        id: 'task_deploy_staging',
        type: 'task',
        title: 'Deploy staging environment',
        status: 'active',
        tags: ['deploy', 'staging'],
        owners: [],
        constraints: [],
        body: '',
        refs: { runs: [], files: [] },
        next_actions: ['Run smoke tests'],
      }),
    );
  });

  afterEach(() => {
    testDb.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.MB_DATA_DIR;
    delete process.env.MB_STORAGE_DIR;
  });

  it('should find runs by keyword', () => {
    const result: RecallResult = recallKeyword('deploy', 10, undefined, undefined, testDb);

    expect(result.mode).toBe('keyword');
    expect(result.source).toBe('keyword');
    expect(result.top_runs.length).toBeGreaterThan(0);
    expect(result.top_runs[0].run_id).toBe('run_deploy_001');
  });

  it('should find nodes by keyword', () => {
    const result = recallKeyword('deploy', 10, undefined, undefined, testDb);

    expect(result.top_nodes.length).toBeGreaterThan(0);
    expect(result.top_nodes[0].node_id).toBe('task_deploy_staging');
  });

  it('should filter by tags', () => {
    const result = recallKeyword('', 10, ['auth'], undefined, testDb);

    const authRuns = result.top_runs.filter((r) => r.run_id === 'run_auth_001');
    expect(authRuns.length).toBe(1);
  });

  it('should return RecallResult with mode and source fields', () => {
    const result = recallKeyword('deploy', 5, undefined, undefined, testDb);

    expect(result).toHaveProperty('query');
    expect(result).toHaveProperty('mode');
    expect(result).toHaveProperty('source');
    expect(result).toHaveProperty('top_runs');
    expect(result).toHaveProperty('top_nodes');
    expect(result).toHaveProperty('applicable_constraints');
    expect(result).toHaveProperty('suggested_next_actions');
  });

  it('should include similarity_score as undefined in keyword mode', () => {
    const result = recallKeyword('deploy', 5, undefined, undefined, testDb);

    for (const run of result.top_runs) {
      expect(run.similarity_score).toBeUndefined();
    }
  });
});
