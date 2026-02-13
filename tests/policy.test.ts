import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { policyCheck } from '../src/core/policy.js';
import Database from 'better-sqlite3';

// We need to mock the policies dir and DB for isolated tests
const TEST_DIR = join(process.cwd(), '.test-policy');
const TEST_POLICIES = join(TEST_DIR, 'policies');
const TEST_STORAGE = join(TEST_DIR, 'storage');

let testDb: Database.Database;

describe('policy-check', () => {
  beforeEach(() => {
    // Override env for test paths
    process.env.MB_DATA_DIR = join(TEST_DIR, 'motherbrain');
    process.env.MB_STORAGE_DIR = TEST_STORAGE;

    mkdirSync(TEST_POLICIES, { recursive: true });
    mkdirSync(TEST_STORAGE, { recursive: true });

    // Create default deny/allow files
    writeFileSync(
      join(TEST_POLICIES, 'denylist.commands.txt'),
      'rm -rf /\ncurl * | bash\nmkfs*\ndd if=*\n',
    );
    writeFileSync(join(TEST_POLICIES, 'allowlist.commands.txt'), '');
    writeFileSync(join(TEST_POLICIES, 'denylist.paths.txt'), '/\n~/.ssh\n~/.ssh/*\n~/.pgpass\n');
    writeFileSync(join(TEST_POLICIES, 'allowlist.paths.txt'), '');
    writeFileSync(join(TEST_POLICIES, 'denylist.hosts.txt'), '');
    writeFileSync(join(TEST_POLICIES, 'allowlist.hosts.txt'), '');

    testDb = new Database(':memory:');
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        allowed INTEGER NOT NULL DEFAULT 1,
        reason TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}'
      );
    `);
  });

  afterEach(() => {
    testDb.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.MB_DATA_DIR;
    delete process.env.MB_STORAGE_DIR;
  });

  // Override getPoliciesDir for tests
  const originalCwd = process.cwd;

  it('should deny dangerous commands', () => {
    // We need to point getPoliciesDir to our test dir
    process.cwd = () => TEST_DIR;
    try {
      const result = policyCheck({ cmd: 'rm -rf /' }, testDb);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('denylist');
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('should allow safe commands', () => {
    process.cwd = () => TEST_DIR;
    try {
      const result = policyCheck({ cmd: 'git status' }, testDb);
      expect(result.allowed).toBe(true);
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('should deny sensitive paths', () => {
    process.cwd = () => TEST_DIR;
    try {
      const result = policyCheck({ path: '~/.ssh' }, testDb);
      expect(result.allowed).toBe(false);
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('should allow normal paths', () => {
    process.cwd = () => TEST_DIR;
    try {
      const result = policyCheck({ path: './src/main.ts' }, testDb);
      expect(result.allowed).toBe(true);
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('should record audit log', () => {
    process.cwd = () => TEST_DIR;
    try {
      policyCheck({ cmd: 'ls -la' }, testDb);
      const rows = testDb.prepare('SELECT * FROM audit').all();
      expect(rows.length).toBe(1);
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('should deny mkfs commands via glob', () => {
    process.cwd = () => TEST_DIR;
    try {
      const result = policyCheck({ cmd: 'mkfs.ext4 /dev/sda1' }, testDb);
      expect(result.allowed).toBe(false);
    } finally {
      process.cwd = originalCwd;
    }
  });
});
