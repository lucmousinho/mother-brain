import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { buildScopeFilter, applyScopeSql } from '../src/core/scope/scope.guard.js';
import { GLOBAL_CONTEXT_ID } from '../src/core/context/context.types.js';

let testDb: Database.Database;

function setupTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      context_id TEXT PRIMARY KEY, name TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('global', 'vertical', 'project')),
      parent_id TEXT, scope_path TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}'
    );
  `);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at)
     VALUES ('__global__', 'Global', 'global', NULL, '__global__', ?, ?)`,
  ).run(now, now);
  return db;
}

describe('scope.guard', () => {
  beforeEach(() => {
    testDb = setupTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  describe('buildScopeFilter', () => {
    it('should return undefined when no context specified', () => {
      expect(buildScopeFilter(undefined, undefined, testDb)).toBeUndefined();
    });

    it('should build filter for global context', () => {
      const filter = buildScopeFilter(GLOBAL_CONTEXT_ID, undefined, testDb);
      expect(filter).toBeDefined();
      expect(filter!.contextIds).toEqual([GLOBAL_CONTEXT_ID]);
    });

    it('should build ancestor chain for vertical', () => {
      const now = new Date().toISOString();
      testDb.prepare(
        `INSERT INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at)
         VALUES ('ctx_v1', 'V1', 'vertical', '__global__', '__global__/ctx_v1', ?, ?)`,
      ).run(now, now);

      const filter = buildScopeFilter('ctx_v1', undefined, testDb);
      expect(filter).toBeDefined();
      expect(filter!.contextIds).toContain('ctx_v1');
      expect(filter!.contextIds).toContain(GLOBAL_CONTEXT_ID);
    });

    it('should resolve context name to ID', () => {
      const now = new Date().toISOString();
      testDb.prepare(
        `INSERT INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at)
         VALUES ('ctx_v1', 'healthcare', 'vertical', '__global__', '__global__/ctx_v1', ?, ?)`,
      ).run(now, now);

      const filter = buildScopeFilter('healthcare', undefined, testDb);
      expect(filter).toBeDefined();
      expect(filter!.contextIds).toContain('ctx_v1');
    });

    it('should handle multiple context IDs', () => {
      const now = new Date().toISOString();
      testDb.prepare(
        `INSERT INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at)
         VALUES ('ctx_v1', 'V1', 'vertical', '__global__', '__global__/ctx_v1', ?, ?)`,
      ).run(now, now);
      testDb.prepare(
        `INSERT INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at)
         VALUES ('ctx_v2', 'V2', 'vertical', '__global__', '__global__/ctx_v2', ?, ?)`,
      ).run(now, now);

      const filter = buildScopeFilter(undefined, ['ctx_v1', 'ctx_v2'], testDb);
      expect(filter).toBeDefined();
      expect(filter!.contextIds).toContain('ctx_v1');
      expect(filter!.contextIds).toContain('ctx_v2');
      expect(filter!.contextIds).toContain(GLOBAL_CONTEXT_ID);
    });
  });

  describe('applyScopeSql', () => {
    it('should pass through when no filter', () => {
      const result = applyScopeSql('SELECT * FROM nodes WHERE 1=1', []);
      expect(result.sql).toBe('SELECT * FROM nodes WHERE 1=1');
      expect(result.params).toEqual([]);
    });

    it('should add IN clause when filter provided', () => {
      const filter = { contextIds: ['ctx_a', '__global__'] };
      const result = applyScopeSql('SELECT * FROM nodes WHERE 1=1', [], filter);
      expect(result.sql).toContain('context_id IN');
      expect(result.params).toEqual(['ctx_a', '__global__']);
    });

    it('should use custom column name', () => {
      const filter = { contextIds: ['ctx_a'] };
      const result = applyScopeSql('SELECT * FROM t WHERE 1=1', [], filter, 'ctx_col');
      expect(result.sql).toContain('ctx_col IN');
    });
  });
});
