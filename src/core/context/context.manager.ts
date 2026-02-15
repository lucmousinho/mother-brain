import type Database from 'better-sqlite3';
import { getDb } from '../../db/database.js';
import { generateContextId } from '../../utils/ids.js';
import { withLock } from '../../utils/filelock.js';
import {
  GLOBAL_CONTEXT_ID,
  CreateContextSchema,
  type CreateContextInput,
  type MemoryContext,
  type ContextScope,
} from './context.types.js';

function rowToContext(row: Record<string, string>): MemoryContext {
  return {
    context_id: row.context_id,
    name: row.name,
    scope: row.scope as ContextScope,
    parent_id: row.parent_id || null,
    scope_path: row.scope_path,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: JSON.parse(row.metadata_json || '{}'),
  };
}

export async function createContext(
  input: CreateContextInput,
  db?: Database.Database,
): Promise<MemoryContext> {
  const parsed = CreateContextSchema.parse(input);
  const database = db || getDb();
  const now = new Date().toISOString();

  // Resolve parent
  let parentId: string | null = null;
  let parentPath: string = GLOBAL_CONTEXT_ID;

  if (parsed.scope === 'vertical') {
    parentId = GLOBAL_CONTEXT_ID;
    parentPath = GLOBAL_CONTEXT_ID;
  } else if (parsed.scope === 'project') {
    if (!parsed.parent_id) {
      throw new Error('Project contexts require a parent vertical context');
    }
    // Look up parent by ID or name
    const parent = getContext(parsed.parent_id, database) ?? getContextByName(parsed.parent_id, database);
    if (!parent) {
      throw new Error(`Parent context not found: ${parsed.parent_id}`);
    }
    if (parent.scope !== 'vertical') {
      throw new Error(`Project parent must be a vertical context, got "${parent.scope}"`);
    }
    parentId = parent.context_id;
    parentPath = parent.scope_path;
  }

  const contextId = generateContextId(parsed.scope);
  const scopePath = `${parentPath}/${contextId}`;

  const context: MemoryContext = {
    context_id: contextId,
    name: parsed.name,
    scope: parsed.scope as ContextScope,
    parent_id: parentId,
    scope_path: scopePath,
    created_at: now,
    updated_at: now,
    metadata: parsed.metadata ?? {},
  };

  await withLock('db-write', () => {
    database
      .prepare(
        `INSERT INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        context.context_id,
        context.name,
        context.scope,
        context.parent_id,
        context.scope_path,
        context.created_at,
        context.updated_at,
        JSON.stringify(context.metadata),
      );
  });

  return context;
}

export function getContext(contextId: string, db?: Database.Database): MemoryContext | null {
  const database = db || getDb();
  const row = database.prepare('SELECT * FROM contexts WHERE context_id = ?').get(contextId) as
    | Record<string, string>
    | undefined;
  if (!row) return null;
  return rowToContext(row);
}

export function getContextByName(name: string, db?: Database.Database): MemoryContext | null {
  const database = db || getDb();
  const row = database.prepare('SELECT * FROM contexts WHERE name = ?').get(name) as
    | Record<string, string>
    | undefined;
  if (!row) return null;
  return rowToContext(row);
}

export function listContexts(
  scope?: ContextScope,
  parentId?: string,
  db?: Database.Database,
): MemoryContext[] {
  const database = db || getDb();
  let sql = 'SELECT * FROM contexts WHERE 1=1';
  const params: string[] = [];

  if (scope) {
    sql += ' AND scope = ?';
    params.push(scope);
  }
  if (parentId) {
    sql += ' AND parent_id = ?';
    params.push(parentId);
  }

  sql += ' ORDER BY scope, name';
  const rows = database.prepare(sql).all(...params) as Record<string, string>[];
  return rows.map(rowToContext);
}

export async function deleteContext(
  contextId: string,
  db?: Database.Database,
): Promise<void> {
  if (contextId === GLOBAL_CONTEXT_ID) {
    throw new Error('Cannot delete the global context');
  }

  const database = db || getDb();

  // Check for children
  const children = database
    .prepare('SELECT COUNT(*) as count FROM contexts WHERE parent_id = ?')
    .get(contextId) as { count: number };
  if (children.count > 0) {
    throw new Error('Cannot delete context with children. Delete child contexts first.');
  }

  // Check for runs
  const runs = database
    .prepare('SELECT COUNT(*) as count FROM runs WHERE context_id = ?')
    .get(contextId) as { count: number };
  if (runs.count > 0) {
    throw new Error('Cannot delete context with associated runs.');
  }

  // Check for nodes
  const nodes = database
    .prepare('SELECT COUNT(*) as count FROM nodes WHERE context_id = ?')
    .get(contextId) as { count: number };
  if (nodes.count > 0) {
    throw new Error('Cannot delete context with associated nodes.');
  }

  await withLock('db-write', () => {
    database.prepare('DELETE FROM contexts WHERE context_id = ?').run(contextId);
  });
}
