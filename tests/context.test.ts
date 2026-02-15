import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createContext, getContext, getContextByName, listContexts, deleteContext } from '../src/core/context/context.manager.js';
import { getAncestorChain, resolveContextScope } from '../src/core/context/context.resolver.js';
import { GLOBAL_CONTEXT_ID } from '../src/core/context/context.types.js';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(process.cwd(), '.test-context');

// We need the database module to use the test db
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

describe('Context System', () => {
  beforeEach(() => {
    process.env.MB_DATA_DIR = join(TEST_DIR, 'motherbrain');
    process.env.MB_STORAGE_DIR = join(TEST_DIR, 'storage');
    mkdirSync(join(TEST_DIR, 'storage', 'locks'), { recursive: true });
    testDb = setupTestDb();
  });

  afterEach(() => {
    testDb.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.MB_DATA_DIR;
    delete process.env.MB_STORAGE_DIR;
  });

  describe('createContext', () => {
    it('should create a vertical context', async () => {
      const ctx = await createContext(
        { name: 'saude', scope: 'vertical' },
        testDb,
      );

      expect(ctx.name).toBe('saude');
      expect(ctx.scope).toBe('vertical');
      expect(ctx.parent_id).toBe(GLOBAL_CONTEXT_ID);
      expect(ctx.context_id).toMatch(/^ctx_vertical_/);
      expect(ctx.scope_path).toBe(`__global__/${ctx.context_id}`);
    });

    it('should create a project context under a vertical', async () => {
      const vertical = await createContext(
        { name: 'saude', scope: 'vertical' },
        testDb,
      );

      const project = await createContext(
        { name: 'drclick', scope: 'project', parent_id: vertical.context_id },
        testDb,
      );

      expect(project.name).toBe('drclick');
      expect(project.scope).toBe('project');
      expect(project.parent_id).toBe(vertical.context_id);
      expect(project.context_id).toMatch(/^ctx_project_/);
      expect(project.scope_path).toBe(`${vertical.scope_path}/${project.context_id}`);
    });

    it('should allow parent lookup by name', async () => {
      await createContext({ name: 'saude', scope: 'vertical' }, testDb);

      const project = await createContext(
        { name: 'drclick', scope: 'project', parent_id: 'saude' },
        testDb,
      );

      expect(project.scope).toBe('project');
      expect(project.name).toBe('drclick');
    });

    it('should reject project without parent', async () => {
      await expect(
        createContext({ name: 'orphan', scope: 'project' }, testDb),
      ).rejects.toThrow('Project contexts require a parent vertical context');
    });

    it('should reject project with global parent', async () => {
      await expect(
        createContext(
          { name: 'bad', scope: 'project', parent_id: GLOBAL_CONTEXT_ID },
          testDb,
        ),
      ).rejects.toThrow('Project parent must be a vertical context');
    });

    it('should reject project with project parent', async () => {
      const vertical = await createContext(
        { name: 'saude', scope: 'vertical' },
        testDb,
      );
      const project = await createContext(
        { name: 'drclick', scope: 'project', parent_id: vertical.context_id },
        testDb,
      );

      await expect(
        createContext(
          { name: 'sub', scope: 'project', parent_id: project.context_id },
          testDb,
        ),
      ).rejects.toThrow('Project parent must be a vertical context');
    });
  });

  describe('getContext / getContextByName', () => {
    it('should retrieve by ID', async () => {
      const created = await createContext(
        { name: 'educacao', scope: 'vertical' },
        testDb,
      );

      const found = getContext(created.context_id, testDb);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('educacao');
    });

    it('should retrieve by name', async () => {
      await createContext({ name: 'jogos', scope: 'vertical' }, testDb);

      const found = getContextByName('jogos', testDb);
      expect(found).not.toBeNull();
      expect(found!.scope).toBe('vertical');
    });

    it('should return null for non-existent', () => {
      expect(getContext('nonexistent', testDb)).toBeNull();
      expect(getContextByName('nonexistent', testDb)).toBeNull();
    });
  });

  describe('listContexts', () => {
    it('should list all contexts', async () => {
      await createContext({ name: 'saude', scope: 'vertical' }, testDb);
      await createContext({ name: 'educacao', scope: 'vertical' }, testDb);

      const all = listContexts(undefined, undefined, testDb);
      expect(all.length).toBe(3); // global + 2 verticals
    });

    it('should filter by scope', async () => {
      await createContext({ name: 'saude', scope: 'vertical' }, testDb);
      await createContext({ name: 'educacao', scope: 'vertical' }, testDb);

      const verticals = listContexts('vertical', undefined, testDb);
      expect(verticals.length).toBe(2);
    });

    it('should filter by parent', async () => {
      const v = await createContext({ name: 'saude', scope: 'vertical' }, testDb);
      await createContext(
        { name: 'drclick', scope: 'project', parent_id: v.context_id },
        testDb,
      );
      await createContext(
        { name: 'medapp', scope: 'project', parent_id: v.context_id },
        testDb,
      );

      const children = listContexts(undefined, v.context_id, testDb);
      expect(children.length).toBe(2);
    });
  });

  describe('deleteContext', () => {
    it('should reject deleting global', async () => {
      await expect(deleteContext(GLOBAL_CONTEXT_ID, testDb)).rejects.toThrow(
        'Cannot delete the global context',
      );
    });

    it('should reject deleting context with children', async () => {
      const v = await createContext({ name: 'saude', scope: 'vertical' }, testDb);
      await createContext(
        { name: 'drclick', scope: 'project', parent_id: v.context_id },
        testDb,
      );

      await expect(deleteContext(v.context_id, testDb)).rejects.toThrow(
        'Cannot delete context with children',
      );
    });

    it('should delete empty context', async () => {
      const v = await createContext({ name: 'empty', scope: 'vertical' }, testDb);
      await deleteContext(v.context_id, testDb);

      expect(getContext(v.context_id, testDb)).toBeNull();
    });
  });

  describe('ancestor chain', () => {
    it('should return chain for project', async () => {
      const v = await createContext({ name: 'saude', scope: 'vertical' }, testDb);
      const p = await createContext(
        { name: 'drclick', scope: 'project', parent_id: v.context_id },
        testDb,
      );

      const chain = getAncestorChain(p.context_id, testDb);
      expect(chain).toEqual([p.context_id, v.context_id, GLOBAL_CONTEXT_ID]);
    });

    it('should return chain for vertical', async () => {
      const v = await createContext({ name: 'saude', scope: 'vertical' }, testDb);

      const chain = getAncestorChain(v.context_id, testDb);
      expect(chain).toEqual([v.context_id, GLOBAL_CONTEXT_ID]);
    });

    it('should return single element for global', () => {
      const chain = getAncestorChain(GLOBAL_CONTEXT_ID, testDb);
      expect(chain).toEqual([GLOBAL_CONTEXT_ID]);
    });
  });

  describe('cross-combination scope', () => {
    it('should union ancestor chains of multiple contexts', async () => {
      const v1 = await createContext({ name: 'saude', scope: 'vertical' }, testDb);
      const p1 = await createContext(
        { name: 'drclick', scope: 'project', parent_id: v1.context_id },
        testDb,
      );

      const v2 = await createContext({ name: 'educacao', scope: 'vertical' }, testDb);
      const p2 = await createContext(
        { name: 'ativedu', scope: 'project', parent_id: v2.context_id },
        testDb,
      );

      const scope = resolveContextScope([p1.context_id, p2.context_id], testDb);

      // Should include both projects, both verticals, and global
      expect(scope).toContain(p1.context_id);
      expect(scope).toContain(p2.context_id);
      expect(scope).toContain(v1.context_id);
      expect(scope).toContain(v2.context_id);
      expect(scope).toContain(GLOBAL_CONTEXT_ID);
      expect(scope.length).toBe(5);
    });
  });
});
