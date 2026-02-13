import { mkdirSync, existsSync, renameSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import {
  detectPlatform,
  resolveAssetName,
  resolveChecksumName,
  resolveDownloadUrl,
  detectInstallInfo,
  compareSemver,
  type PlatformInfo,
  type InstallInfo,
} from './updater.platform.js';
import {
  fetchLatestRelease,
  fetchRelease,
  downloadToFile,
  type ReleaseInfo,
} from './updater.github.js';
import { sha256File, extractChecksum, validateBinary } from './updater.verify.js';

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  platform: PlatformInfo;
  install: InstallInfo;
}

export interface UpdateResult {
  previousVersion: string;
  newVersion: string;
  backupPath: string;
}

export type LogFn = (msg: string) => void;

/**
 * Check whether an update is available.
 */
export async function checkForUpdate(
  currentVersion: string,
  targetTag?: string,
): Promise<UpdateCheckResult> {
  const plat = detectPlatform();
  const install = detectInstallInfo();

  let release: ReleaseInfo;
  if (targetTag) {
    release = await fetchRelease(targetTag);
  } else {
    release = await fetchLatestRelease();
  }

  const latestVersion = release.tag_name;
  const updateAvailable = targetTag
    ? latestVersion !== normalizeVersion(currentVersion)
    : compareSemver(latestVersion, currentVersion) > 0;

  return {
    currentVersion: normalizeVersion(currentVersion),
    latestVersion,
    updateAvailable,
    releaseUrl: release.html_url,
    platform: plat,
    install,
  };
}

/**
 * Perform the full update: download, verify, swap.
 */
export async function performUpdate(
  currentVersion: string,
  targetTag: string,
  force: boolean,
  log: LogFn,
): Promise<UpdateResult> {
  const plat = detectPlatform();
  const install = detectInstallInfo();

  if (!install.isBundleInstall) {
    throw new Error(
      'Self-update is only available for bundle installations (installed via install.sh).\n' +
        'For source installs, use: git pull && pnpm install && pnpm build',
    );
  }

  const version = targetTag.startsWith('v') ? targetTag : `v${targetTag}`;
  const assetName = resolveAssetName(version, plat);
  const checksumName = resolveChecksumName(version);
  const assetUrl = resolveDownloadUrl(version, assetName);
  const checksumUrl = resolveDownloadUrl(version, checksumName);

  // Create temp directory
  const tmpDir = mkdtempSync(join(tmpdir(), 'motherbrain-update-'));

  try {
    // ── 1. Download tarball ──────────────────────────────────────
    log(`Downloading ${assetName}...`);
    const tarballPath = join(tmpDir, assetName);
    await downloadToFile(assetUrl, tarballPath);
    log('Download complete.');

    // ── 2. Download and verify checksum ──────────────────────────
    log('Verifying checksum...');
    const checksumPath = join(tmpDir, checksumName);
    let checksumVerified = false;

    try {
      await downloadToFile(checksumUrl, checksumPath);
      const expectedHash = await extractChecksum(checksumPath, assetName);

      if (expectedHash) {
        const actualHash = await sha256File(tarballPath);
        if (actualHash !== expectedHash) {
          throw new Error(
            `Checksum mismatch!\n  Expected: ${expectedHash}\n  Actual:   ${actualHash}\nThe download may be corrupted.`,
          );
        }
        checksumVerified = true;
        log(`Checksum verified: ${actualHash.slice(0, 16)}...`);
      } else {
        log('Asset not found in checksums file — skipping verification.');
      }
    } catch (err) {
      if ((err as Error).message.includes('Checksum mismatch')) throw err;
      log('Checksums file not available — skipping verification.');
    }

    if (!checksumVerified && !force) {
      throw new Error(
        'Checksum could not be verified. Use --force to skip checksum verification.',
      );
    }

    // ── 3. Extract to temp dir ───────────────────────────────────
    log('Extracting...');
    const extractDir = join(tmpDir, 'extracted');
    mkdirSync(extractDir, { recursive: true });
    execSync(`tar -xzf "${tarballPath}" -C "${extractDir}"`, { stdio: 'pipe' });

    // Find extracted directory (motherbrain-v{VER}-{os}-{arch}/)
    const expectedDirName = assetName.replace('.tar.gz', '');
    let bundleDir = join(extractDir, expectedDirName);

    if (!existsSync(bundleDir)) {
      // Try finding any directory inside extract
      const { readdirSync } = await import('node:fs');
      const entries = readdirSync(extractDir);
      const dirs = entries.filter((e) =>
        existsSync(join(extractDir, e, 'motherbrain')),
      );
      if (dirs.length === 1) {
        bundleDir = join(extractDir, dirs[0]);
      } else {
        throw new Error(
          `Expected directory ${expectedDirName} not found after extraction.`,
        );
      }
    }

    // ── 4. Validate extracted binary ─────────────────────────────
    log('Validating new binary...');
    const newBinary = join(bundleDir, 'motherbrain');
    if (!existsSync(newBinary)) {
      throw new Error(`Binary not found at ${newBinary} after extraction.`);
    }
    chmodSync(newBinary, 0o755);

    const versionOutput = validateBinary(newBinary);
    if (!versionOutput) {
      throw new Error('New binary failed validation — it does not produce a --version output.');
    }
    log(`New binary validated: ${versionOutput}`);

    // ── 5. Swap bundles atomically ───────────────────────────────
    const { bundleHome, currentDir } = install;
    const backupDir = join(bundleHome, 'previous');

    // Remove old backup if exists
    if (existsSync(backupDir)) {
      rmSync(backupDir, { recursive: true, force: true });
    }

    // Move current → previous (backup)
    if (existsSync(currentDir)) {
      log('Backing up current version...');
      renameSync(currentDir, backupDir);
    }

    // Move extracted → current
    try {
      renameSync(bundleDir, currentDir);
    } catch (moveErr) {
      // Rollback: restore backup
      log('Install failed — rolling back...');
      if (existsSync(backupDir)) {
        renameSync(backupDir, currentDir);
      }
      throw moveErr;
    }

    // ── 6. Post-install verification ─────────────────────────────
    log('Verifying installation...');
    const installedBinary = join(currentDir, 'motherbrain');
    chmodSync(installedBinary, 0o755);

    const finalVersion = validateBinary(installedBinary);
    if (!finalVersion) {
      // Rollback
      log('Post-install verification failed — rolling back...');
      rmSync(currentDir, { recursive: true, force: true });
      if (existsSync(backupDir)) {
        renameSync(backupDir, currentDir);
      }
      throw new Error('Installed binary failed verification. Rolled back to previous version.');
    }

    log(`Installed: ${finalVersion}`);

    return {
      previousVersion: normalizeVersion(currentVersion),
      newVersion: version,
      backupPath: backupDir,
    };
  } finally {
    // Clean up temp dir
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Rollback to the previous version.
 */
export function rollback(install: InstallInfo): boolean {
  const backupDir = join(install.bundleHome, 'previous');

  if (!existsSync(backupDir)) {
    return false;
  }

  const { currentDir } = install;

  if (existsSync(currentDir)) {
    rmSync(currentDir, { recursive: true, force: true });
  }

  renameSync(backupDir, currentDir);
  return true;
}

function normalizeVersion(v: string): string {
  // Extract version from oclif output like "mother-brain/0.1.0 darwin-arm64 node-v22.12.0"
  const match = v.match(/(\d+\.\d+\.\d+)/);
  if (match) {
    return `v${match[1]}`;
  }
  return v.startsWith('v') ? v : `v${v}`;
}
