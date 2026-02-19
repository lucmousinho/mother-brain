import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { KnowledgeNode } from './schemas.js';
import { getSnapshotsDir } from '../utils/paths.js';
import { getDb } from '../db/database.js';
import { buildScopeFilter } from './scope/scope.guard.js';

export interface SnapshotResult {
  context_path: string;
  tasks_path: string;
  active_tasks: number;
  total_nodes: number;
  total_runs: number;
}

export function generateSnapshot(
  db?: Database.Database,
  contextId?: string,
): SnapshotResult {
  const database = db || getDb();
  const snapshotsDir = getSnapshotsDir();
  mkdirSync(snapshotsDir, { recursive: true });

  const scopeFilter = buildScopeFilter(contextId, undefined, database);

  // Gather data (scoped to context)
  let nodesSql = 'SELECT raw_json FROM nodes WHERE 1=1';
  const nodesParams: unknown[] = [];
  if (scopeFilter) {
    const placeholders = scopeFilter.contextIds.map(() => '?').join(',');
    nodesSql += ` AND context_id IN (${placeholders})`;
    nodesParams.push(...scopeFilter.contextIds);
  }
  nodesSql += ' ORDER BY type, node_id';

  const nodes = database.prepare(nodesSql).all(...nodesParams) as { raw_json: string }[];

  let runsSql = 'SELECT run_id, timestamp, agent_id, goal, summary, status FROM runs WHERE 1=1';
  const runsParams: unknown[] = [];
  if (scopeFilter) {
    const placeholders = scopeFilter.contextIds.map(() => '?').join(',');
    runsSql += ` AND context_id IN (${placeholders})`;
    runsParams.push(...scopeFilter.contextIds);
  }
  runsSql += ' ORDER BY timestamp DESC LIMIT 50';

  const runs = database.prepare(runsSql).all(...runsParams) as {
    run_id: string;
    timestamp: string;
    agent_id: string;
    goal: string;
    summary: string;
    status: string;
  }[];

  const parsedNodes = nodes.map((n) => JSON.parse(n.raw_json) as KnowledgeNode);
  const activeTasks = parsedNodes.filter((n) => n.type === 'task' && n.status === 'active');

  // Generate current_context.md
  const lines: string[] = [];
  lines.push(`# Mother Brain - Current Context`);
  lines.push(`\n_Generated: ${new Date().toISOString()}_\n`);

  lines.push(`## Summary\n`);
  lines.push(`- Total nodes: ${nodes.length}`);
  lines.push(`- Active tasks: ${activeTasks.length}`);
  lines.push(`- Recent runs: ${runs.length}\n`);

  // Group nodes by type
  const byType = new Map<string, KnowledgeNode[]>();
  for (const node of parsedNodes) {
    const arr = byType.get(node.type) || [];
    arr.push(node);
    byType.set(node.type, arr);
  }

  for (const [type, typeNodes] of byType) {
    lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)}s\n`);
    for (const node of typeNodes) {
      const statusIcon = node.status === 'active' ? '>' : node.status === 'done' ? 'x' : '-';
      lines.push(`- [${statusIcon}] **${node.title}** (\`${node.id}\`) [${node.status}]`);
      if (node.tags.length > 0) {
        lines.push(`  Tags: ${node.tags.join(', ')}`);
      }
    }
    lines.push('');
  }

  lines.push(`## Recent Runs\n`);
  for (const run of runs.slice(0, 20)) {
    lines.push(`- **${run.run_id}** [${run.status}] ${run.goal}`);
    lines.push(`  _${run.timestamp}_ by ${run.agent_id}`);
    if (run.summary) lines.push(`  ${run.summary}`);
    lines.push('');
  }

  const contextPath = join(snapshotsDir, 'current_context.md');
  writeFileSync(contextPath, lines.join('\n'), 'utf-8');

  // Generate active_tasks.json
  const tasksJson = activeTasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    tags: t.tags,
    owners: t.owners,
    next_actions: t.next_actions,
  }));

  const tasksPath = join(snapshotsDir, 'active_tasks.json');
  writeFileSync(tasksPath, JSON.stringify(tasksJson, null, 2), 'utf-8');

  return {
    context_path: contextPath,
    tasks_path: tasksPath,
    active_tasks: activeTasks.length,
    total_nodes: nodes.length,
    total_runs: runs.length,
  };
}
