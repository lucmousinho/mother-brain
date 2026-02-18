import type Database from 'better-sqlite3';
import type { ScopeFilter } from './scope.types.js';
import { GLOBAL_CONTEXT_ID } from '../context/context.types.js';
import { resolveContext, getAncestorChain, resolveContextScope } from '../context/context.resolver.js';
import { getContext, getContextByName } from '../context/context.manager.js';

/**
 * Resolve a context name or ID to the canonical context_id.
 */
function resolveToId(nameOrId: string, db?: Database.Database): string {
  const byId = getContext(nameOrId, db);
  if (byId) return byId.context_id;
  const byName = getContextByName(nameOrId, db);
  if (byName) return byName.context_id;
  return nameOrId;
}

export function buildScopeFilter(
  contextId?: string,
  contextIds?: string[],
  db?: Database.Database,
): ScopeFilter | undefined {
  // Multiple explicit context IDs — union of ancestor chains
  if (contextIds && contextIds.length > 0) {
    const resolvedIds = contextIds.map((id) => resolveToId(id, db));
    const resolved = resolveContextScope(resolvedIds, db);
    return { contextIds: resolved };
  }

  // Single context ID — build ancestor chain
  if (contextId) {
    const resolvedId = resolveToId(contextId, db);
    const chain = getAncestorChain(resolvedId, db);
    return { contextIds: chain };
  }

  // No context specified — no filter (global, returns everything)
  return undefined;
}

export function applyScopeSql(
  baseSql: string,
  params: unknown[],
  scopeFilter?: ScopeFilter,
  columnName: string = 'context_id',
): { sql: string; params: unknown[] } {
  if (!scopeFilter) {
    return { sql: baseSql, params };
  }

  const placeholders = scopeFilter.contextIds.map(() => '?').join(',');
  const sql = `${baseSql} AND ${columnName} IN (${placeholders})`;
  const newParams = [...params, ...scopeFilter.contextIds];

  return { sql, params: newParams };
}
