import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { PolicyCheckRequest } from './schemas.js';
import { getPoliciesDir } from '../utils/paths.js';
import { getDb } from '../db/database.js';

export interface PolicyResult {
  allowed: boolean;
  reason: string;
  checks: PolicyCheckDetail[];
}

export interface PolicyCheckDetail {
  dimension: 'cmd' | 'path' | 'host';
  value: string;
  allowed: boolean;
  matched_rule: string;
}

function loadPolicyFile(filename: string): string[] {
  const filePath = join(getPoliciesDir(), filename);
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

function matchesPattern(
  value: string,
  pattern: string,
  dimension: 'cmd' | 'path' | 'host',
): boolean {
  if (pattern === '*') return true;

  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
    return regex.test(value);
  }

  if (dimension === 'path') {
    // For paths: exact match or the value starts with pattern as a directory prefix
    const normVal = value.toLowerCase();
    const normPat = pattern.toLowerCase();
    return normVal === normPat || normVal.startsWith(normPat + '/');
  }

  // For commands and hosts: substring match
  return value.toLowerCase().includes(pattern.toLowerCase());
}

function checkDimension(
  dimension: 'cmd' | 'path' | 'host',
  value: string | undefined,
): PolicyCheckDetail | null {
  if (!value) return null;

  const denyList = loadPolicyFile(`denylist.${dimension === 'cmd' ? 'commands' : dimension === 'path' ? 'paths' : 'hosts'}.txt`);
  const allowList = loadPolicyFile(`allowlist.${dimension === 'cmd' ? 'commands' : dimension === 'path' ? 'paths' : 'hosts'}.txt`);

  // Denylist always wins
  for (const pattern of denyList) {
    if (matchesPattern(value, pattern, dimension)) {
      return {
        dimension,
        value,
        allowed: false,
        matched_rule: `denylist: ${pattern}`,
      };
    }
  }

  // If allowlist exists and is non-empty, value must match
  if (allowList.length > 0) {
    const matched = allowList.find((pattern) => matchesPattern(value, pattern, dimension));
    if (!matched) {
      return {
        dimension,
        value,
        allowed: false,
        matched_rule: 'not in allowlist',
      };
    }
    return {
      dimension,
      value,
      allowed: true,
      matched_rule: `allowlist: ${matched}`,
    };
  }

  // No allowlist = allow by default
  return {
    dimension,
    value,
    allowed: true,
    matched_rule: 'default allow (no allowlist)',
  };
}

export function policyCheck(request: PolicyCheckRequest, db?: Database.Database): PolicyResult {
  const checks: PolicyCheckDetail[] = [];

  const cmdCheck = checkDimension('cmd', request.cmd);
  if (cmdCheck) checks.push(cmdCheck);

  const pathCheck = checkDimension('path', request.path);
  if (pathCheck) checks.push(pathCheck);

  const hostCheck = checkDimension('host', request.host);
  if (hostCheck) checks.push(hostCheck);

  const denied = checks.find((c) => !c.allowed);
  const result: PolicyResult = {
    allowed: !denied,
    reason: denied ? denied.matched_rule : 'all checks passed',
    checks,
  };

  // Audit log
  const database = db || getDb();
  const stmt = database.prepare(`
    INSERT INTO audit (timestamp, action, allowed, reason, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    new Date().toISOString(),
    'policy_check',
    result.allowed ? 1 : 0,
    result.reason,
    JSON.stringify(request),
  );

  return result;
}
