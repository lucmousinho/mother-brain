import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { RunCheckpointSchema } from './schemas.js';
import { getCheckpointsDir, getLinksDir } from '../utils/paths.js';
import { generateRunId } from '../utils/ids.js';
import { getDb } from '../db/database.js';
import { withLock } from '../utils/filelock.js';
import { indexRunVector } from './vectorIndex.js';
import { resolveContext } from './context/context.resolver.js';
import { getContext, getContextByName } from './context/context.manager.js';

/**
 * Resolve a context name or ID to the canonical context_id.
 * Tries lookup by ID first, then by name, falls back to the raw value.
 */
function resolveContextId(nameOrId: string | undefined, db: Database.Database): string | null {
  if (!nameOrId) return null;
  const byId = getContext(nameOrId, db);
  if (byId) return byId.context_id;
  const byName = getContextByName(nameOrId, db);
  if (byName) return byName.context_id;
  return nameOrId;
}

export interface RecordResult {
  run_id: string;
  file_path: string;
  linked_nodes: string[];
}

export async function recordCheckpoint(
  input: unknown,
  db?: Database.Database,
  contextId?: string,
): Promise<RecordResult> {
  const parsed = RunCheckpointSchema.parse(input);

  const now = new Date();
  if (!parsed.run_id) parsed.run_id = generateRunId();
  if (!parsed.timestamp) parsed.timestamp = now.toISOString();

  const database = db || getDb();
  const rawContextId = contextId ?? parsed.context_id ?? resolveContext(undefined, database);
  const effectiveContextId = resolveContextId(rawContextId, database) ?? resolveContext(undefined, database);

  const runId = parsed.run_id;
  const ts = new Date(parsed.timestamp);
  const yyyy = String(ts.getFullYear());
  const mm = String(ts.getMonth() + 1).padStart(2, '0');

  // Write checkpoint file (append-only)
  const checkpointDir = join(getCheckpointsDir(), yyyy, mm);
  mkdirSync(checkpointDir, { recursive: true });
  const filePath = join(checkpointDir, `${runId}.json`);
  const jsonStr = JSON.stringify(parsed, null, 2);
  writeFileSync(filePath, jsonStr, 'utf-8');

  // Index in SQLite
  await withLock('db-write', () => {
    const insertRun = database.prepare(`
      INSERT OR REPLACE INTO runs (run_id, timestamp, agent_id, goal, summary, status, tags_json, raw_json, context_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertRun.run(
      runId,
      parsed.timestamp,
      parsed.agent.id,
      parsed.intent.goal,
      parsed.result.summary,
      parsed.result.status,
      JSON.stringify(parsed.tags),
      jsonStr,
      effectiveContextId,
    );

    // Link nodes
    if (parsed.links.nodes.length > 0) {
      const insertLink = database.prepare(`
        INSERT OR IGNORE INTO links (run_id, node_id) VALUES (?, ?)
      `);
      for (const nodeId of parsed.links.nodes) {
        insertLink.run(runId, nodeId);
      }

      // Write link file
      const linkDir = getLinksDir();
      mkdirSync(linkDir, { recursive: true });
      writeFileSync(
        join(linkDir, `${runId}.json`),
        JSON.stringify({ run_id: runId, nodes: parsed.links.nodes }, null, 2),
        'utf-8',
      );
    }
  });

  // Index in vector store (non-blocking, best-effort)
  indexRunVector(parsed, effectiveContextId).catch(() => {
    // Vector indexing failure must never break checkpoint recording
  });

  return {
    run_id: runId,
    file_path: filePath,
    linked_nodes: parsed.links.nodes,
  };
}
