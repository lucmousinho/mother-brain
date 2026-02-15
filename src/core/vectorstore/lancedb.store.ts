import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { VectorDoc, VectorSearchResult, VectorFilter } from './vector.types.js';
import { TABLE_NAME, seedRecord, DEFAULT_DIMENSIONS } from './lancedb.schema.js';
import { getStorageDir } from '../../utils/paths.js';

/** Internal references — lazy-initialized. */
let dbInstance: LanceDatabase | null = null;
let tableInstance: LanceTable | null = null;

/** Minimal interfaces matching the @lancedb/lancedb API surface we use. */
interface LanceTable {
  add(data: Record<string, unknown>[]): Promise<void>;
  search(vector: number[]): LanceQuery;
  delete(filter: string): Promise<void>;
  countRows(): Promise<number>;
}

interface LanceQuery {
  limit(k: number): LanceQuery;
  where(filter: string): LanceQuery;
  toArray(): Promise<LanceSearchRow[]>;
}

interface LanceSearchRow {
  id: string;
  kind: string;
  ref_id: string;
  text: string;
  tags_json: string;
  type: string;
  status: string;
  updated_at: string;
  context_id: string;
  scope_path: string;
  _distance: number;
}

interface LanceDatabase {
  createTable(name: string, data: Record<string, unknown>[]): Promise<LanceTable>;
  openTable(name: string): Promise<LanceTable>;
  tableNames(): Promise<string[]>;
}

function getVectorPath(): string {
  if (process.env.MB_VECTOR_PATH) {
    return resolve(process.env.MB_VECTOR_PATH);
  }
  return resolve(getStorageDir(), 'vector');
}

// ── Public API ──────────────────────────────────────────────────────

export async function initVectorStore(): Promise<void> {
  if (dbInstance && tableInstance) return;

  const dbPath = getVectorPath();
  mkdirSync(dbPath, { recursive: true });

  const lancedb = await import('@lancedb/lancedb');
  dbInstance = (await lancedb.connect(dbPath)) as unknown as LanceDatabase;

  const tables = await dbInstance.tableNames();
  if (tables.includes(TABLE_NAME)) {
    tableInstance = await dbInstance.openTable(TABLE_NAME);
  } else {
    // Create table with seed record so schema is inferred
    tableInstance = await dbInstance.createTable(TABLE_NAME, [
      seedRecord(DEFAULT_DIMENSIONS) as unknown as Record<string, unknown>,
    ]);
  }
}

export async function upsertVectorDoc(doc: VectorDoc): Promise<void> {
  if (!tableInstance) await initVectorStore();
  const table = tableInstance!;

  // Delete existing record with same id, then add new one
  try {
    await table.delete(`id = '${doc.id}'`);
  } catch {
    // Row may not exist — safe to ignore
  }

  await table.add([doc as unknown as Record<string, unknown>]);
}

export async function semanticSearch(
  queryVec: number[],
  k: number = 10,
  filters?: VectorFilter,
  contextIds?: string[],
): Promise<VectorSearchResult[]> {
  if (!tableInstance) await initVectorStore();
  const table = tableInstance!;

  let query = table.search(queryVec).limit(k + 5); // fetch extra to compensate for seed/filter

  // Build WHERE clause
  const clauses: string[] = ["id != '__seed__'"];
  if (filters?.kind) clauses.push(`kind = '${filters.kind}'`);
  if (filters?.type) clauses.push(`type = '${filters.type}'`);
  if (filters?.status) clauses.push(`status = '${filters.status}'`);

  // Context filtering
  if (contextIds && contextIds.length > 0) {
    const ctxClauses = contextIds.map((id) => `context_id = '${id}'`).join(' OR ');
    clauses.push(`(${ctxClauses} OR context_id = '' OR context_id = '__global__')`);
  }

  if (clauses.length > 0) {
    query = query.where(clauses.join(' AND '));
  }

  const rows = await query.toArray();

  return rows.slice(0, k).map((row) => ({
    id: row.id,
    kind: row.kind as VectorSearchResult['kind'],
    ref_id: row.ref_id,
    text: row.text,
    tags_json: row.tags_json,
    type: row.type,
    status: row.status,
    updated_at: row.updated_at,
    similarity_score: distanceToSimilarity(row._distance),
    context_id: row.context_id ?? '',
    scope_path: row.scope_path ?? '',
  }));
}

export async function vectorStoreReady(): Promise<boolean> {
  try {
    if (!tableInstance) await initVectorStore();
    return true;
  } catch {
    return false;
  }
}

export async function countVectorDocs(): Promise<number> {
  if (!tableInstance) return 0;
  const total = await tableInstance.countRows();
  // Subtract 1 for seed record
  return Math.max(0, total - 1);
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Convert L2 distance to a 0-1 similarity score.
 * For normalized vectors: cos_sim = 1 - (L2² / 2)
 */
function distanceToSimilarity(distance: number): number {
  const sim = 1 - (distance * distance) / 2;
  return Math.max(0, Math.min(1, sim));
}
