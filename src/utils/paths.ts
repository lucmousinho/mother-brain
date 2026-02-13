import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

export function getProjectRoot(): string {
  return process.cwd();
}

export function getDataDir(): string {
  return resolve(getProjectRoot(), process.env.MB_DATA_DIR || './motherbrain');
}

export function getStorageDir(): string {
  return resolve(getProjectRoot(), process.env.MB_STORAGE_DIR || './storage');
}

export function getDbPath(): string {
  return join(getStorageDir(), 'motherbrain.sqlite');
}

export function getLocksDir(): string {
  return join(getStorageDir(), 'locks');
}

export function getCheckpointsDir(): string {
  return join(getDataDir(), 'checkpoints', 'v1');
}

export function getTreeDir(type?: string): string {
  const base = join(getDataDir(), 'tree');
  return type ? join(base, pluralizeType(type)) : base;
}

export function getSnapshotsDir(): string {
  return join(getDataDir(), 'snapshots');
}

export function getLinksDir(): string {
  return join(getDataDir(), 'links', 'by-run');
}

export function getPoliciesDir(): string {
  return resolve(getProjectRoot(), 'policies');
}

export function getTemplatesDir(): string {
  return resolve(getProjectRoot(), 'templates');
}

export function isInitialized(): boolean {
  return existsSync(getDataDir()) && existsSync(getStorageDir());
}

function pluralizeType(type: string): string {
  const map: Record<string, string> = {
    project: 'projects',
    goal: 'goals',
    task: 'tasks',
    decision: 'decisions',
    pattern: 'patterns',
    constraint: 'constraints',
    playbook: 'playbooks',
    agent: 'agents',
  };
  return map[type] || type;
}
