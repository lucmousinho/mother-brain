import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

/**
 * Compute SHA-256 hash of a file.
 */
export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Parse a checksums.txt file and extract the hash for a specific asset.
 * Format: `<hash>  <filename>` or `<hash> <filename>`
 */
export async function extractChecksum(
  checksumsPath: string,
  assetName: string,
): Promise<string | null> {
  const content = await readFile(checksumsPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format: hash  filename  OR  hash filename
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && parts[1] === assetName) {
      return parts[0];
    }
  }

  return null;
}

/**
 * Verify SHA-256 checksum of a file against expected value.
 */
export async function verifyChecksum(filePath: string, expectedHash: string): Promise<boolean> {
  const actualHash = await sha256File(filePath);
  return actualHash === expectedHash;
}

/**
 * Validate that an extracted binary is executable and returns a version string.
 */
export function validateBinary(binaryPath: string): string | null {
  try {
    const output = execSync(`"${binaryPath}" --version`, {
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 10_000,
    });
    return output.trim();
  } catch {
    return null;
  }
}
