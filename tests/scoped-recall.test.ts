import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createContext } from '../src/core/context/context.manager.js';
import { GLOBAL_CONTEXT_ID } from '../src/core/context/context.types.js';
import { recallKeyword } from '../src/core/recall.js';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(process.cwd(), '.test-scoped-recall');

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
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (parent_id) REFERENCES contexts(context_id)
    );
    CREATE INDEX IF NOT EXISTS idx_contexts_scope ON contexts(scope);
    CREATE INDEX IF NOT EXISTS idx_contexts_parent ON contexts(parent_id);
    CREATE INDEX IF NOT EXISTS idx_runs_context ON runs(context_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_context ON nodes(context_id);
  `);

  // Seed global context
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at, metadata_json)
     VALUES ('__global__', 'Global', 'global', NULL, '__global__', ?, ?, '{}')`,
  ).run(now, now);

  return db;
}

function insertRun(
  db: Database.Database,
  runId: string,
  goal: string,
  contextId: string,
  tags: string[] = [],
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO runs (run_id, timestamp, agent_id, goal, summary, status, tags_json, raw_json, context_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(runId, now, 'agent_test', goal, `Summary: ${goal}`, 'success', JSON.stringify(tags), '{}', contextId);
}

function insertNode(
  db: Database.Database,
  nodeId: string,
  type: string,
  title: string,
  contextId: string,
  tags: string[] = [],
): void {
  const node = {
    id: nodeId,
    type,
    title,
    status: 'active',
    tags,
    owners: [],
    constraints: [],
    body: '',
    refs: { runs: [], files: [] },
    next_actions: [],
  };
  db.prepare(
    `INSERT INTO nodes (node_id, type, title, status, tags_json, raw_json, context_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(nodeId, type, title, 'active', JSON.stringify(tags), JSON.stringify(node), contextId);
}

describe('Scoped Recall', () => {
  let verticalId: string;
  let projectAId: string;
  let projectBId: string;

  beforeEach(async () => {
    process.env.MB_DATA_DIR = join(TEST_DIR, 'motherbrain');
    process.env.MB_STORAGE_DIR = join(TEST_DIR, 'storage');
    mkdirSync(join(TEST_DIR, 'storage', 'locks'), { recursive: true });
    testDb = setupTestDb();

    // Create hierarchy: global → saude (vertical) → drclick (A), medapp (B)
    const vertical = await createContext({ name: 'saude', scope: 'vertical' }, testDb);
    verticalId = vertical.context_id;

    const projectA = await createContext(
      { name: 'drclick', scope: 'project', parent_id: verticalId },
      testDb,
    );
    projectAId = projectA.context_id;

    const projectB = await createContext(
      { name: 'medapp', scope: 'project', parent_id: verticalId },
      testDb,
    );
    projectBId = projectB.context_id;

    // Seed runs in different scopes
    insertRun(testDb, 'run_global_deploy', 'deploy global infra', GLOBAL_CONTEXT_ID, ['deploy']);
    insertRun(testDb, 'run_vertical_health', 'deploy health vertical', verticalId, ['deploy', 'health']);
    insertRun(testDb, 'run_projectA_api', 'deploy drclick api', projectAId, ['deploy', 'api']);
    insertRun(testDb, 'run_projectB_web', 'deploy medapp web', projectBId, ['deploy', 'web']);

    // Seed nodes in different scopes
    insertNode(testDb, 'task_global', 'task', 'Global deploy task', GLOBAL_CONTEXT_ID, ['deploy']);
    insertNode(testDb, 'task_vertical', 'task', 'Health vertical deploy', verticalId, ['deploy']);
    insertNode(testDb, 'task_projectA', 'task', 'DrClick deploy task', projectAId, ['deploy']);
    insertNode(testDb, 'task_projectB', 'task', 'MedApp deploy task', projectBId, ['deploy']);
  });

  afterEach(() => {
    testDb.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.MB_DATA_DIR;
    delete process.env.MB_STORAGE_DIR;
  });

  it('recall in project A returns project A + vertical + global data', () => {
    const result = recallKeyword('deploy', 10, undefined, undefined, testDb, projectAId);

    const runIds = result.top_runs.map((r) => r.run_id);
    expect(runIds).toContain('run_global_deploy');
    expect(runIds).toContain('run_vertical_health');
    expect(runIds).toContain('run_projectA_api');
    // Must NOT contain sibling project B
    expect(runIds).not.toContain('run_projectB_web');

    const nodeIds = result.top_nodes.map((n) => n.node_id);
    expect(nodeIds).toContain('task_global');
    expect(nodeIds).toContain('task_vertical');
    expect(nodeIds).toContain('task_projectA');
    expect(nodeIds).not.toContain('task_projectB');
  });

  it('recall in project B does NOT return project A data', () => {
    const result = recallKeyword('deploy', 10, undefined, undefined, testDb, projectBId);

    const runIds = result.top_runs.map((r) => r.run_id);
    expect(runIds).toContain('run_global_deploy');
    expect(runIds).toContain('run_vertical_health');
    expect(runIds).toContain('run_projectB_web');
    expect(runIds).not.toContain('run_projectA_api');
  });

  it('recall in vertical returns vertical + global, NOT child project data', () => {
    const result = recallKeyword('deploy', 10, undefined, undefined, testDb, verticalId);

    const runIds = result.top_runs.map((r) => r.run_id);
    expect(runIds).toContain('run_global_deploy');
    expect(runIds).toContain('run_vertical_health');
    // Vertical recall does NOT include child project data
    expect(runIds).not.toContain('run_projectA_api');
    expect(runIds).not.toContain('run_projectB_web');
  });

  it('recall unscoped (no context) returns everything', () => {
    const result = recallKeyword('deploy', 10, undefined, undefined, testDb);

    const runIds = result.top_runs.map((r) => r.run_id);
    expect(runIds).toContain('run_global_deploy');
    expect(runIds).toContain('run_vertical_health');
    expect(runIds).toContain('run_projectA_api');
    expect(runIds).toContain('run_projectB_web');
  });
});
