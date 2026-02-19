import type Database from 'better-sqlite3';
import type { ScopeFilter } from './scope.types.js';
import { resolveContextId, getAncestorChain, resolveContextScope } from '../context/context.resolver.js';

export function buildScopeFilter(
  contextId?: string,
  contextIds?: string[],
  db?: Database.Database,
): ScopeFilter | undefined {
  // Multiple explicit context IDs — union of ancestor chains
  if (contextIds && contextIds.length > 0) {
    const resolvedIds = contextIds.map((id) => resolveContextId(id, db) ?? id);
    const resolved = resolveContextScope(resolvedIds, db);
    return { contextIds: resolved };
  }

  // Single context ID — build ancestor chain
  if (contextId) {
    const resolvedId = resolveContextId(contextId, db) ?? contextId;
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
