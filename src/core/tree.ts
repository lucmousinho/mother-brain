import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { NodeSchema, type KnowledgeNode } from './schemas.js';
import { getTreeDir } from '../utils/paths.js';
import { generateNodeId } from '../utils/ids.js';
import { nodeToMarkdown } from '../utils/markdown.js';
import { getDb } from '../db/database.js';
import { withLock } from '../utils/filelock.js';
import { indexNodeVector } from './vectorIndex.js';
import { resolveContext } from './context/context.resolver.js';

export interface UpsertResult {
  node_id: string;
  file_path: string;
  created: boolean;
}

export async function upsertNode(
  input: unknown,
  db?: Database.Database,
  contextId?: string,
): Promise<UpsertResult> {
  const parsed = NodeSchema.parse(input);
  const now = new Date().toISOString();

  // Check if node already exists
  const database = db || getDb();
  const existing = database
    .prepare('SELECT node_id FROM nodes WHERE node_id = ?')
    .get(parsed.id) as { node_id: string } | undefined;

  const isCreate = !existing;

  const effectiveContextId = contextId ?? parsed.context_id ?? resolveContext(undefined, database);

  if (!parsed.created_at) parsed.created_at = isCreate ? now : now;
  parsed.updated_at = now;

  if (isCreate && !parsed.id.includes('_')) {
    parsed.id = generateNodeId(parsed.type);
  }

  // Write markdown file
  const typeDir = getTreeDir(parsed.type);
  mkdirSync(typeDir, { recursive: true });
  const filePath = join(typeDir, `${parsed.id}.md`);
  const md = nodeToMarkdown(parsed);
  writeFileSync(filePath, md, 'utf-8');

  // Index in SQLite
  await withLock('db-write', () => {
    const stmt = database.prepare(`
      INSERT OR REPLACE INTO nodes (node_id, type, title, status, tags_json, raw_md, raw_json, context_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      parsed.id,
      parsed.type,
      parsed.title,
      parsed.status,
      JSON.stringify(parsed.tags),
      md,
      JSON.stringify(parsed),
      effectiveContextId,
    );
  });

  // Index in vector store (non-blocking, best-effort)
  indexNodeVector(parsed, effectiveContextId).catch(() => {
    // Vector indexing failure must never break node upsert
  });

  return {
    node_id: parsed.id,
    file_path: filePath,
    created: isCreate,
  };
}

export function getNode(nodeId: string, db?: Database.Database): KnowledgeNode | null {
  const database = db || getDb();
  const row = database.prepare('SELECT raw_json FROM nodes WHERE node_id = ?').get(nodeId) as
    | { raw_json: string }
    | undefined;
  if (!row) return null;
  return JSON.parse(row.raw_json) as KnowledgeNode;
}

export function listNodes(
  type?: string,
  status?: string,
  db?: Database.Database,
  contextIds?: string[],
): KnowledgeNode[] {
  const database = db || getDb();
  let sql = 'SELECT raw_json FROM nodes WHERE 1=1';
  const params: unknown[] = [];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (contextIds && contextIds.length > 0) {
    const placeholders = contextIds.map(() => '?').join(',');
    sql += ` AND context_id IN (${placeholders})`;
    params.push(...contextIds);
  }

  sql += ' ORDER BY node_id';
  const rows = database.prepare(sql).all(...params) as { raw_json: string }[];
  return rows.map((r) => JSON.parse(r.raw_json) as KnowledgeNode);
}
