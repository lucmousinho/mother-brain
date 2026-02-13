import { mkdirSync, writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getLocksDir } from './paths.js';

const STALE_LOCK_MS = 30_000; // 30 seconds

export function acquireLock(name: string): boolean {
  const locksDir = getLocksDir();
  mkdirSync(locksDir, { recursive: true });
  const lockFile = join(locksDir, `${name}.lock`);

  if (existsSync(lockFile)) {
    const content = readFileSync(lockFile, 'utf-8');
    const ts = parseInt(content, 10);
    if (!isNaN(ts) && Date.now() - ts < STALE_LOCK_MS) {
      return false;
    }
    // Stale lock, remove it
    unlinkSync(lockFile);
  }

  writeFileSync(lockFile, String(Date.now()), { flag: 'wx' });
  return true;
}

export function releaseLock(name: string): void {
  const lockFile = join(getLocksDir(), `${name}.lock`);
  if (existsSync(lockFile)) {
    unlinkSync(lockFile);
  }
}

export async function withLock<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
  const maxRetries = 10;
  const retryDelay = 200;

  for (let i = 0; i < maxRetries; i++) {
    if (acquireLock(name)) {
      try {
        return await fn();
      } finally {
        releaseLock(name);
      }
    }
    await new Promise((r) => setTimeout(r, retryDelay));
  }

  throw new Error(`Could not acquire lock "${name}" after ${maxRetries} retries`);
}
