import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { RunCheckpointSchema } from './schemas.js';
import { getCheckpointsDir, getLinksDir } from '../utils/paths.js';
import { generateRunId } from '../utils/ids.js';
import { getDb } from '../db/database.js';
import { withLock } from '../utils/filelock.js';

export interface RecordResult {
  run_id: string;
  file_path: string;
  linked_nodes: string[];
}

export async function recordCheckpoint(
  input: unknown,
  db?: Database.Database,
): Promise<RecordResult> {
  const parsed = RunCheckpointSchema.parse(input);

  const now = new Date();
  if (!parsed.run_id) parsed.run_id = generateRunId();
  if (!parsed.timestamp) parsed.timestamp = now.toISOString();

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
  const database = db || getDb();
  await withLock('db-write', () => {
    const insertRun = database.prepare(`
      INSERT OR REPLACE INTO runs (run_id, timestamp, agent_id, goal, summary, status, tags_json, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

  return {
    run_id: runId,
    file_path: filePath,
    linked_nodes: parsed.links.nodes,
  };
}
