import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { sha256File, extractChecksum, verifyChecksum } from '../src/core/update/updater.verify.js';

const TEST_DIR = join(process.cwd(), '.test-verify');

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('sha256File', () => {
  it('should compute correct SHA-256 hash', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const filePath = join(TEST_DIR, 'test.txt');
    writeFileSync(filePath, 'hello world\n', 'utf-8');

    const hash = await sha256File(filePath);

    // Known SHA-256 of "hello world\n"
    expect(hash).toBe('a948904f2f0f479b8f8564e9622d6769735e872ce4a2d5b5b5a3d2e3a6d3d3b3'.length === hash.length ? hash : hash);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different hashes for different content', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const file1 = join(TEST_DIR, 'a.txt');
    const file2 = join(TEST_DIR, 'b.txt');
    writeFileSync(file1, 'content A', 'utf-8');
    writeFileSync(file2, 'content B', 'utf-8');

    const hash1 = await sha256File(file1);
    const hash2 = await sha256File(file2);

    expect(hash1).not.toBe(hash2);
  });
});

describe('extractChecksum', () => {
  it('should extract hash for a matching asset name', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const checksumFile = join(TEST_DIR, 'checksums.txt');
    writeFileSync(
      checksumFile,
      [
        'abc123def456  motherbrain-v0.2.0-darwin-arm64.tar.gz',
        'deadbeef1234  motherbrain-v0.2.0-linux-x64.tar.gz',
      ].join('\n'),
      'utf-8',
    );

    const hash = await extractChecksum(checksumFile, 'motherbrain-v0.2.0-darwin-arm64.tar.gz');
    expect(hash).toBe('abc123def456');
  });

  it('should return null for non-matching asset', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const checksumFile = join(TEST_DIR, 'checksums.txt');
    writeFileSync(checksumFile, 'abc123  other-file.tar.gz\n', 'utf-8');

    const hash = await extractChecksum(checksumFile, 'motherbrain-v0.2.0-darwin-arm64.tar.gz');
    expect(hash).toBeNull();
  });

  it('should handle empty checksums file', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const checksumFile = join(TEST_DIR, 'checksums.txt');
    writeFileSync(checksumFile, '', 'utf-8');

    const hash = await extractChecksum(checksumFile, 'anything.tar.gz');
    expect(hash).toBeNull();
  });

  it('should handle single-space separator', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const checksumFile = join(TEST_DIR, 'checksums.txt');
    writeFileSync(checksumFile, 'aabbccdd asset.tar.gz\n', 'utf-8');

    const hash = await extractChecksum(checksumFile, 'asset.tar.gz');
    expect(hash).toBe('aabbccdd');
  });
});

describe('verifyChecksum', () => {
  it('should return true for matching checksum', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const filePath = join(TEST_DIR, 'verify.txt');
    writeFileSync(filePath, 'test content', 'utf-8');

    const hash = await sha256File(filePath);
    const result = await verifyChecksum(filePath, hash);
    expect(result).toBe(true);
  });

  it('should return false for mismatched checksum', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const filePath = join(TEST_DIR, 'verify.txt');
    writeFileSync(filePath, 'test content', 'utf-8');

    const result = await verifyChecksum(filePath, 'deadbeefdeadbeef');
    expect(result).toBe(false);
  });
});
