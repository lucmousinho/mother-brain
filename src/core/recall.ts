import type Database from 'better-sqlite3';
import type { KnowledgeNode } from './schemas.js';
import { getDb } from '../db/database.js';
import type { VectorSearchResult } from './vectorstore/vector.types.js';
import { buildScopeFilter } from './scope/scope.guard.js';
import type { ScopeFilter } from './scope/scope.types.js';

// ── Types ───────────────────────────────────────────────────────────

export type RecallMode = 'keyword' | 'semantic' | 'hybrid';

export interface RecallResult {
  query: string;
  mode: RecallMode;
  source: 'keyword' | 'vector' | 'hybrid';
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
  similarity_score?: number;
}

export interface NodeSummary {
  node_id: string;
  type: string;
  title: string;
  status: string;
  tags: string[];
  score: number;
  similarity_score?: number;
}

// ── Main entry point ────────────────────────────────────────────────

export async function recall(
  query: string,
  limit: number = 10,
  tags?: string[],
  nodeTypes?: string[],
  db?: Database.Database,
  mode?: RecallMode,
  contextId?: string,
  contextIds?: string[],
): Promise<RecallResult> {
  const resolvedMode = mode ?? getDefaultMode();

  const database = db || getDb();
  const scopeFilter = buildScopeFilter(contextId, contextIds, database);

  // Attempt semantic/hybrid first, fall back to keyword on failure
  if (resolvedMode === 'semantic') {
    try {
      return await semanticRecall(query, limit, tags, nodeTypes, database, scopeFilter);
    } catch {
      // Fallback to keyword
      return keywordRecall(query, limit, tags, nodeTypes, database, 'keyword', scopeFilter);
    }
  }

  if (resolvedMode === 'hybrid') {
    try {
      return await hybridRecall(query, limit, tags, nodeTypes, database, scopeFilter);
    } catch {
      // Fallback to keyword
      return keywordRecall(query, limit, tags, nodeTypes, database, 'keyword', scopeFilter);
    }
  }

  return keywordRecall(query, limit, tags, nodeTypes, database, 'keyword', scopeFilter);
}

/** Synchronous keyword-only recall — preserves original behaviour. */
export function recallKeyword(
  query: string,
  limit: number = 10,
  tags?: string[],
  nodeTypes?: string[],
  db?: Database.Database,
  contextId?: string,
): RecallResult {
  const database = db || getDb();
  const scopeFilter = contextId ? buildScopeFilter(contextId, undefined, database) : undefined;
  return keywordRecall(query, limit, tags, nodeTypes, database, 'keyword', scopeFilter);
}

// ── Keyword mode ────────────────────────────────────────────────────

function keywordRecall(
  query: string,
  limit: number,
  tags?: string[],
  nodeTypes?: string[],
  db?: Database.Database,
  source: RecallResult['source'] = 'keyword',
  scopeFilter?: ScopeFilter,
): RecallResult {
  const database = db || getDb();
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);

  // ── Search runs ──────────────────────────────────────────────
  let runsSql = `SELECT run_id, timestamp, agent_id, goal, summary, status, tags_json, raw_json
     FROM runs WHERE 1=1`;
  const runsParams: unknown[] = [];

  if (scopeFilter) {
    const placeholders = scopeFilter.contextIds.map(() => '?').join(',');
    runsSql += ` AND context_id IN (${placeholders})`;
    runsParams.push(...scopeFilter.contextIds);
  }

  runsSql += ' ORDER BY timestamp DESC LIMIT 200';

  const allRuns = database.prepare(runsSql).all(...runsParams) as {
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

      for (const kw of keywords) {
        if (searchText.includes(kw)) score += 2;
        if (row.run_id.includes(kw)) score += 3;
      }

      if (tags) {
        for (const t of tags) {
          if (runTags.includes(t)) score += 3;
        }
      }

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

  // ── Search nodes ─────────────────────────────────────────────
  let nodesSql = `SELECT node_id, type, title, status, tags_json, raw_json FROM nodes WHERE 1=1`;
  const nodeParams: unknown[] = [];

  if (nodeTypes && nodeTypes.length > 0) {
    nodesSql += ` AND type IN (${nodeTypes.map(() => '?').join(',')})`;
    nodeParams.push(...nodeTypes);
  }

  if (scopeFilter) {
    const placeholders = scopeFilter.contextIds.map(() => '?').join(',');
    nodesSql += ` AND context_id IN (${placeholders})`;
    nodeParams.push(...scopeFilter.contextIds);
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

  // ── Constraints + next actions ───────────────────────────────
  const { applicable_constraints, suggested_next_actions } = gatherMeta(database, scopeFilter);

  return {
    query,
    mode: 'keyword',
    source,
    top_runs: scoredRuns,
    top_nodes: scoredNodes,
    applicable_constraints,
    suggested_next_actions,
  };
}

// ── Semantic mode (vector-only) ─────────────────────────────────────

async function semanticRecall(
  query: string,
  limit: number,
  _tags?: string[],
  _nodeTypes?: string[],
  db?: Database.Database,
  scopeFilter?: ScopeFilter,
): Promise<RecallResult> {
  const { embedText } = await import('./embeddings/embeddings.local.js');
  const { semanticSearch } = await import('./vectorstore/lancedb.store.js');

  const queryVec = await embedText(query);
  const topK = parseInt(process.env.MB_VECTOR_TOP_K || String(limit), 10);
  const results = await semanticSearch(
    queryVec,
    topK * 2,
    undefined,
    scopeFilter?.contextIds,
  );

  const runs = vectorResultsToRuns(results.filter((r) => r.kind === 'run'), limit);
  const nodes = vectorResultsToNodes(results.filter((r) => r.kind === 'node'), limit);

  const database = db || getDb();
  const { applicable_constraints, suggested_next_actions } = gatherMeta(database, scopeFilter);

  return {
    query,
    mode: 'semantic',
    source: 'vector',
    top_runs: runs,
    top_nodes: nodes,
    applicable_constraints,
    suggested_next_actions,
  };
}

// ── Hybrid mode (vector + keyword rerank) ───────────────────────────

async function hybridRecall(
  query: string,
  limit: number,
  tags?: string[],
  nodeTypes?: string[],
  db?: Database.Database,
  scopeFilter?: ScopeFilter,
): Promise<RecallResult> {
  const database = db || getDb();

  // Get both keyword and semantic results
  const kwResult = keywordRecall(query, limit * 2, tags, nodeTypes, database, 'hybrid', scopeFilter);

  const { embedText } = await import('./embeddings/embeddings.local.js');
  const { semanticSearch } = await import('./vectorstore/lancedb.store.js');

  const queryVec = await embedText(query);
  const topK = parseInt(process.env.MB_VECTOR_TOP_K || String(limit), 10);
  const vecResults = await semanticSearch(
    queryVec,
    topK * 2,
    undefined,
    scopeFilter?.contextIds,
  );

  // Merge runs: combine keyword scores with similarity scores
  const runMap = new Map<string, RunSummary>();

  for (const r of kwResult.top_runs) {
    runMap.set(r.run_id, { ...r });
  }

  for (const vr of vecResults.filter((r) => r.kind === 'run')) {
    const existing = runMap.get(vr.ref_id);
    if (existing) {
      // Boost existing keyword match with similarity
      existing.score += Math.round(vr.similarity_score * 10);
      existing.similarity_score = vr.similarity_score;
    } else {
      // Add vector-only result with estimated score
      runMap.set(vr.ref_id, vectorRunToSummary(vr));
    }
  }

  const mergedRuns = Array.from(runMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Merge nodes
  const nodeMap = new Map<string, NodeSummary>();

  for (const n of kwResult.top_nodes) {
    nodeMap.set(n.node_id, { ...n });
  }

  for (const vr of vecResults.filter((r) => r.kind === 'node')) {
    const existing = nodeMap.get(vr.ref_id);
    if (existing) {
      existing.score += Math.round(vr.similarity_score * 10);
      existing.similarity_score = vr.similarity_score;
    } else {
      nodeMap.set(vr.ref_id, vectorNodeToSummary(vr));
    }
  }

  const mergedNodes = Array.from(nodeMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const { applicable_constraints, suggested_next_actions } = gatherMeta(database, scopeFilter);

  return {
    query,
    mode: 'hybrid',
    source: 'hybrid',
    top_runs: mergedRuns,
    top_nodes: mergedNodes,
    applicable_constraints,
    suggested_next_actions,
  };
}

// ── Shared helpers ──────────────────────────────────────────────────

function getDefaultMode(): RecallMode {
  const env = process.env.MB_RECALL_MODE;
  if (env === 'semantic' || env === 'hybrid' || env === 'keyword') return env;
  return 'keyword';
}

function gatherMeta(
  database: Database.Database,
  scopeFilter?: ScopeFilter,
): {
  applicable_constraints: string[];
  suggested_next_actions: string[];
} {
  let constraintSql = `SELECT raw_json FROM nodes WHERE type = 'constraint' AND status = 'active'`;
  const constraintParams: unknown[] = [];

  if (scopeFilter) {
    const placeholders = scopeFilter.contextIds.map(() => '?').join(',');
    constraintSql += ` AND context_id IN (${placeholders})`;
    constraintParams.push(...scopeFilter.contextIds);
  }

  const constraintNodes = database.prepare(constraintSql).all(...constraintParams) as {
    raw_json: string;
  }[];

  const applicable_constraints = constraintNodes.map((c) => {
    const node = JSON.parse(c.raw_json) as KnowledgeNode;
    return `[${node.id}] ${node.title}`;
  });

  let taskSql = `SELECT raw_json FROM nodes WHERE type = 'task' AND status = 'active'`;
  const taskParams: unknown[] = [];

  if (scopeFilter) {
    const placeholders = scopeFilter.contextIds.map(() => '?').join(',');
    taskSql += ` AND context_id IN (${placeholders})`;
    taskParams.push(...scopeFilter.contextIds);
  }

  taskSql += ' ORDER BY node_id LIMIT 10';

  const suggested_next_actions: string[] = [];
  const activeTaskNodes = database.prepare(taskSql).all(...taskParams) as {
    raw_json: string;
  }[];

  for (const row of activeTaskNodes) {
    const node = JSON.parse(row.raw_json) as KnowledgeNode;
    for (const action of node.next_actions) {
      suggested_next_actions.push(`[${node.id}] ${action}`);
    }
  }

  return {
    applicable_constraints,
    suggested_next_actions: suggested_next_actions.slice(0, 20),
  };
}

function vectorResultsToRuns(results: VectorSearchResult[], limit: number): RunSummary[] {
  return results.slice(0, limit).map((r) => vectorRunToSummary(r));
}

function vectorRunToSummary(r: VectorSearchResult): RunSummary {
  return {
    run_id: r.ref_id,
    timestamp: r.updated_at,
    agent_id: '',
    goal: r.text.slice(0, 200),
    summary: '',
    status: r.status,
    score: Math.round(r.similarity_score * 10),
    similarity_score: r.similarity_score,
  };
}

function vectorResultsToNodes(results: VectorSearchResult[], limit: number): NodeSummary[] {
  return results.slice(0, limit).map((r) => vectorNodeToSummary(r));
}

function vectorNodeToSummary(r: VectorSearchResult): NodeSummary {
  const tags: string[] = (() => {
    try {
      return JSON.parse(r.tags_json) as string[];
    } catch {
      return [];
    }
  })();

  return {
    node_id: r.ref_id,
    type: r.type,
    title: r.text.slice(0, 200),
    status: r.status,
    tags,
    score: Math.round(r.similarity_score * 10),
    similarity_score: r.similarity_score,
  };
}

// ── Markdown formatter ──────────────────────────────────────────────

export function formatRecallMarkdown(result: RecallResult): string {
  const lines: string[] = [];
  lines.push(`# Recall: "${result.query}" [${result.mode}/${result.source}]\n`);

  lines.push(`## Top Runs (${result.top_runs.length})\n`);
  if (result.top_runs.length === 0) {
    lines.push('_No matching runs found._\n');
  } else {
    for (const r of result.top_runs) {
      const sim = r.similarity_score !== undefined ? ` sim=${r.similarity_score.toFixed(3)}` : '';
      lines.push(`- **${r.run_id}** [${r.status}] score=${r.score}${sim}`);
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
      const sim = n.similarity_score !== undefined ? ` sim=${n.similarity_score.toFixed(3)}` : '';
      lines.push(`- **${n.node_id}** (${n.type}) [${n.status}] score=${n.score}${sim}`);
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
