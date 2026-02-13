import type Database from 'better-sqlite3';
import type { KnowledgeNode } from './schemas.js';
import { getDb } from '../db/database.js';

export interface RecallResult {
  query: string;
  top_runs: RunSummary[];
  top_nodes: NodeSummary[];
  applicable_constraints: string[];
  suggested_next_actions: string[];
}

export interface RunSummary {
  run_id: string;
  timestamp: string;
  agent_id: string;
  goal: string;
  summary: string;
  status: string;
  score: number;
}

export interface NodeSummary {
  node_id: string;
  type: string;
  title: string;
  status: string;
  tags: string[];
  score: number;
}

export function recall(
  query: string,
  limit: number = 10,
  tags?: string[],
  nodeTypes?: string[],
  db?: Database.Database,
): RecallResult {
  const database = db || getDb();
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);

  // ── Search runs ────────────────────────────────────────────────
  const allRuns = database
    .prepare(
      `SELECT run_id, timestamp, agent_id, goal, summary, status, tags_json, raw_json
       FROM runs ORDER BY timestamp DESC LIMIT 200`,
    )
    .all() as {
    run_id: string;
    timestamp: string;
    agent_id: string;
    goal: string;
    summary: string;
    status: string;
    tags_json: string;
    raw_json: string;
  }[];

  const scoredRuns: RunSummary[] = allRuns
    .map((row) => {
      let score = 0;
      const searchText = `${row.goal} ${row.summary} ${row.agent_id}`.toLowerCase();
      const runTags: string[] = JSON.parse(row.tags_json);

      // Keyword matching
      for (const kw of keywords) {
        if (searchText.includes(kw)) score += 2;
        if (row.run_id.includes(kw)) score += 3;
      }

      // Tag matching
      if (tags) {
        for (const t of tags) {
          if (runTags.includes(t)) score += 3;
        }
      }

      // Recency boost (last 24h = +2, last week = +1)
      const age = Date.now() - new Date(row.timestamp).getTime();
      if (age < 86_400_000) score += 2;
      else if (age < 604_800_000) score += 1;

      return {
        run_id: row.run_id,
        timestamp: row.timestamp,
        agent_id: row.agent_id,
        goal: row.goal,
        summary: row.summary,
        status: row.status,
        score,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // ── Search nodes ───────────────────────────────────────────────
  let nodesSql = `SELECT node_id, type, title, status, tags_json, raw_json FROM nodes WHERE 1=1`;
  const nodeParams: string[] = [];

  if (nodeTypes && nodeTypes.length > 0) {
    nodesSql += ` AND type IN (${nodeTypes.map(() => '?').join(',')})`;
    nodeParams.push(...nodeTypes);
  }

  nodesSql += ' ORDER BY node_id';

  const allNodes = database.prepare(nodesSql).all(...nodeParams) as {
    node_id: string;
    type: string;
    title: string;
    status: string;
    tags_json: string;
    raw_json: string;
  }[];

  const scoredNodes: NodeSummary[] = allNodes
    .map((row) => {
      let score = 0;
      const nodeTags: string[] = JSON.parse(row.tags_json);
      const searchText = `${row.title} ${nodeTags.join(' ')} ${row.type}`.toLowerCase();

      for (const kw of keywords) {
        if (searchText.includes(kw)) score += 2;
        if (row.node_id.includes(kw)) score += 3;
      }

      if (tags) {
        for (const t of tags) {
          if (nodeTags.includes(t)) score += 3;
        }
      }

      // Active nodes get a boost
      if (row.status === 'active') score += 1;

      return {
        node_id: row.node_id,
        type: row.type,
        title: row.title,
        status: row.status,
        tags: nodeTags,
        score,
      };
    })
    .filter((n) => n.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // ── Gather constraints ─────────────────────────────────────────
  const constraintNodes = database
    .prepare(`SELECT raw_json FROM nodes WHERE type = 'constraint' AND status = 'active'`)
    .all() as { raw_json: string }[];

  const applicable_constraints = constraintNodes.map((c) => {
    const node = JSON.parse(c.raw_json) as KnowledgeNode;
    return `[${node.id}] ${node.title}`;
  });

  // ── Gather suggested next actions ──────────────────────────────
  const suggested_next_actions: string[] = [];
  const activeTaskNodes = database
    .prepare(
      `SELECT raw_json FROM nodes WHERE type = 'task' AND status = 'active' ORDER BY node_id LIMIT 10`,
    )
    .all() as { raw_json: string }[];

  for (const row of activeTaskNodes) {
    const node = JSON.parse(row.raw_json) as KnowledgeNode;
    for (const action of node.next_actions) {
      suggested_next_actions.push(`[${node.id}] ${action}`);
    }
  }

  return {
    query,
    top_runs: scoredRuns,
    top_nodes: scoredNodes,
    applicable_constraints,
    suggested_next_actions: suggested_next_actions.slice(0, 20),
  };
}

export function formatRecallMarkdown(result: RecallResult): string {
  const lines: string[] = [];
  lines.push(`# Recall: "${result.query}"\n`);

  lines.push(`## Top Runs (${result.top_runs.length})\n`);
  if (result.top_runs.length === 0) {
    lines.push('_No matching runs found._\n');
  } else {
    for (const r of result.top_runs) {
      lines.push(`- **${r.run_id}** [${r.status}] score=${r.score}`);
      lines.push(`  Goal: ${r.goal}`);
      lines.push(`  Summary: ${r.summary}`);
      lines.push('');
    }
  }

  lines.push(`## Top Nodes (${result.top_nodes.length})\n`);
  if (result.top_nodes.length === 0) {
    lines.push('_No matching nodes found._\n');
  } else {
    for (const n of result.top_nodes) {
      lines.push(`- **${n.node_id}** (${n.type}) [${n.status}] score=${n.score}`);
      lines.push(`  ${n.title}`);
      lines.push('');
    }
  }

  if (result.applicable_constraints.length > 0) {
    lines.push(`## Applicable Constraints\n`);
    for (const c of result.applicable_constraints) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }

  if (result.suggested_next_actions.length > 0) {
    lines.push(`## Suggested Next Actions\n`);
    for (const a of result.suggested_next_actions) {
      lines.push(`- [ ] ${a}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
