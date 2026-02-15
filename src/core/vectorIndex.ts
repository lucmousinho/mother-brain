/**
 * Bridge module: builds embedding text from runs/nodes and upserts into the vector store.
 *
 * Every function here is best-effort — callers catch and ignore errors so that
 * the primary write path (file + SQLite) is never blocked.
 */

import type { RunCheckpoint, KnowledgeNode } from './schemas.js';
import { isReady } from './embeddings/embeddings.local.js';
import { GLOBAL_CONTEXT_ID } from './context/context.types.js';
import { getContext } from './context/context.manager.js';

function recallModeEnabled(): boolean {
  const mode = process.env.MB_RECALL_MODE || 'keyword';
  return mode === 'semantic' || mode === 'hybrid';
}

/** Build a single embedding string from a run checkpoint. */
function runToText(run: RunCheckpoint): string {
  const parts: string[] = [
    run.intent.goal,
    run.result.summary,
    ...(run.intent.context ?? []),
    ...run.actions.map((a) => a.command ?? a.detail ?? '').filter(Boolean),
    ...run.tags,
  ];
  return parts.join(' ').slice(0, 2000);
}

/** Build a single embedding string from a knowledge node. */
function nodeToText(node: KnowledgeNode): string {
  const parts: string[] = [
    node.title,
    ...node.tags,
    ...node.next_actions,
    node.body,
  ];
  return parts.join(' ').slice(0, 2000);
}

function lookupScopePath(contextId: string): string {
  if (contextId === GLOBAL_CONTEXT_ID) return GLOBAL_CONTEXT_ID;
  try {
    const ctx = getContext(contextId);
    return ctx?.scope_path ?? GLOBAL_CONTEXT_ID;
  } catch {
    return GLOBAL_CONTEXT_ID;
  }
}

export async function indexRunVector(run: RunCheckpoint, contextId?: string): Promise<void> {
  if (!recallModeEnabled() && !isReady()) return;

  const { embedText } = await import('./embeddings/embeddings.local.js');
  const { upsertVectorDoc } = await import('./vectorstore/lancedb.store.js');

  const effectiveContextId = contextId ?? GLOBAL_CONTEXT_ID;
  const scopePath = lookupScopePath(effectiveContextId);

  const text = runToText(run);
  const vector = await embedText(text);

  await upsertVectorDoc({
    id: `run_${run.run_id}`,
    kind: 'run',
    ref_id: run.run_id ?? '',
    vector,
    text,
    tags_json: JSON.stringify(run.tags),
    type: 'run',
    status: run.result.status,
    updated_at: run.timestamp ?? new Date().toISOString(),
    context_id: effectiveContextId,
    scope_path: scopePath,
  });
}

export async function indexNodeVector(node: KnowledgeNode, contextId?: string): Promise<void> {
  if (!recallModeEnabled() && !isReady()) return;

  const { embedText } = await import('./embeddings/embeddings.local.js');
  const { upsertVectorDoc } = await import('./vectorstore/lancedb.store.js');

  const effectiveContextId = contextId ?? GLOBAL_CONTEXT_ID;
  const scopePath = lookupScopePath(effectiveContextId);

  const text = nodeToText(node);
  const vector = await embedText(text);

  await upsertVectorDoc({
    id: `node_${node.id}`,
    kind: 'node',
    ref_id: node.id,
    vector,
    text,
    tags_json: JSON.stringify(node.tags),
    type: node.type,
    status: node.status,
    updated_at: node.updated_at ?? new Date().toISOString(),
    context_id: effectiveContextId,
    scope_path: scopePath,
  });
}
