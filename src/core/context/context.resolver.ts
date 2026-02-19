import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { getDb } from '../../db/database.js';
import { getStorageDir } from '../../utils/paths.js';
import { getContext, getContextByName } from './context.manager.js';
import { GLOBAL_CONTEXT_ID, type ActiveContextInfo, type ContextScope } from './context.types.js';

const ACTIVE_CONTEXT_FILE = 'active_context.json';

function getActiveContextPath(): string {
  return join(getStorageDir(), ACTIVE_CONTEXT_FILE);
}

export function resolveContext(
  explicitId?: string,
  db?: Database.Database,
): string {
  // 1. Explicit ID takes priority
  if (explicitId) return explicitId;

  // 2. Active context file
  const active = getActiveContext();
  if (active) return active.context_id;

  // 3. Default to global
  return GLOBAL_CONTEXT_ID;
}

export function getActiveContext(): ActiveContextInfo | null {
  const filePath = getActiveContextPath();
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ActiveContextInfo;
  } catch {
    return null;
  }
}

export async function setActiveContext(
  contextIdOrName: string,
  db?: Database.Database,
): Promise<ActiveContextInfo> {
  const database = db || getDb();

  // Look up by ID first, then by name
  const context =
    getContext(contextIdOrName, database) ?? getContextByName(contextIdOrName, database);

  if (!context) {
    throw new Error(`Context not found: ${contextIdOrName}`);
  }

  const info: ActiveContextInfo = {
    context_id: context.context_id,
    name: context.name,
    scope: context.scope as ContextScope,
    scope_path: context.scope_path,
    set_at: new Date().toISOString(),
  };

  const filePath = getActiveContextPath();
  mkdirSync(getStorageDir(), { recursive: true });
  writeFileSync(filePath, JSON.stringify(info, null, 2), 'utf-8');

  return info;
}

export function clearActiveContext(): void {
  const filePath = getActiveContextPath();
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export function getAncestorChain(
  contextId: string,
  db?: Database.Database,
): string[] {
  if (contextId === GLOBAL_CONTEXT_ID) return [GLOBAL_CONTEXT_ID];

  const database = db || getDb();
  const chain: string[] = [];
  let currentId: string | null = contextId;

  while (currentId) {
    chain.push(currentId);
    if (currentId === GLOBAL_CONTEXT_ID) break;

    const row = database
      .prepare('SELECT parent_id FROM contexts WHERE context_id = ?')
      .get(currentId) as { parent_id: string | null } | undefined;

    if (!row) break;
    currentId = row.parent_id;
  }

  // Ensure global is always included
  if (!chain.includes(GLOBAL_CONTEXT_ID)) {
    chain.push(GLOBAL_CONTEXT_ID);
  }

  return chain;
}

/**
 * Resolve a context name or ID to the canonical context_id.
 * Tries lookup by ID first, then by name, falls back to the raw value.
 */
export function resolveContextId(nameOrId: string | undefined, db?: Database.Database): string | null {
  if (!nameOrId) return null;
  const database = db || getDb();
  const byId = getContext(nameOrId, database);
  if (byId) return byId.context_id;
  const byName = getContextByName(nameOrId, database);
  if (byName) return byName.context_id;
  return nameOrId;
}

export function resolveContextScope(
  contextIds: string[],
  db?: Database.Database,
): string[] {
  const database = db || getDb();
  const allIds = new Set<string>();

  for (const id of contextIds) {
    const chain = getAncestorChain(id, database);
    for (const ancestorId of chain) {
      allIds.add(ancestorId);
    }
  }

  return Array.from(allIds);
}
