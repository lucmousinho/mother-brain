import { mkdirSync, writeSync, unlinkSync, readFileSync, openSync, closeSync, constants } from 'node:fs';
import { join } from 'node:path';
import { getLocksDir } from './paths.js';

const STALE_LOCK_MS = 30_000; // 30 seconds

export function acquireLock(name: string): boolean {
  const locksDir = getLocksDir();
  mkdirSync(locksDir, { recursive: true });
  const lockFile = join(locksDir, `${name}.lock`);

  // Attempt atomic create via O_CREAT | O_EXCL — fails if file exists
  try {
    const fd = openSync(lockFile, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
    const buf = Buffer.from(String(Date.now()));
    writeSync(fd, buf);
    closeSync(fd);
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }

  // File exists — check if it is stale
  try {
    const content = readFileSync(lockFile, 'utf-8');
    const ts = parseInt(content, 10);
    if (!isNaN(ts) && Date.now() - ts < STALE_LOCK_MS) {
      return false;
    }
    // Stale lock — remove and retry atomically
    unlinkSync(lockFile);
    return acquireLock(name);
  } catch {
    return false;
  }
}

export function releaseLock(name: string): void {
  const lockFile = join(getLocksDir(), `${name}.lock`);
  try {
    unlinkSync(lockFile);
  } catch {
    // Lock file may already be removed
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
