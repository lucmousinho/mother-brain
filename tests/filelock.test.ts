import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { acquireLock, releaseLock, withLock } from '../src/utils/filelock.js';

const TEST_DIR = join(process.cwd(), '.test-filelock');

describe('filelock', () => {
  beforeEach(() => {
    process.env.MB_STORAGE_DIR = join(TEST_DIR, 'storage');
    mkdirSync(join(TEST_DIR, 'storage', 'locks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.MB_STORAGE_DIR;
  });

  describe('acquireLock / releaseLock', () => {
    it('should acquire a lock successfully', () => {
      const acquired = acquireLock('test-lock');
      expect(acquired).toBe(true);
      releaseLock('test-lock');
    });

    it('should fail to acquire when lock is held', () => {
      expect(acquireLock('held-lock')).toBe(true);
      expect(acquireLock('held-lock')).toBe(false);
      releaseLock('held-lock');
    });

    it('should allow re-acquire after release', () => {
      acquireLock('reacquire');
      releaseLock('reacquire');
      expect(acquireLock('reacquire')).toBe(true);
      releaseLock('reacquire');
    });

    it('releaseLock should not throw for non-existent lock', () => {
      expect(() => releaseLock('nonexistent')).not.toThrow();
    });
  });

  describe('withLock', () => {
    it('should execute function under lock', async () => {
      let executed = false;
      await withLock('wl-test', () => {
        executed = true;
      });
      expect(executed).toBe(true);
    });

    it('should release lock even if function throws', async () => {
      try {
        await withLock('wl-throw', () => {
          throw new Error('boom');
        });
      } catch {
        // expected
      }
      // Should be able to acquire again
      expect(acquireLock('wl-throw')).toBe(true);
      releaseLock('wl-throw');
    });

    it('should return the function result', async () => {
      const result = await withLock('wl-return', () => 42);
      expect(result).toBe(42);
    });

    it('should support async functions', async () => {
      const result = await withLock('wl-async', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'done';
      });
      expect(result).toBe('done');
    });
  });
});
