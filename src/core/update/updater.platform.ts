import { platform, arch } from 'node:os';
import { execSync } from 'node:child_process';
import { existsSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export interface PlatformInfo {
  os: 'darwin' | 'linux';
  arch: 'x64' | 'arm64';
}

export interface InstallInfo {
  /** Resolved symlink path, e.g. /usr/local/bin/motherbrain */
  symlinkPath: string | null;
  /** Bundle home, e.g. ~/.motherbrain */
  bundleHome: string;
  /** Current bundle dir, e.g. ~/.motherbrain/current */
  currentDir: string;
  /** Whether this looks like a bundle install (vs running from source) */
  isBundleInstall: boolean;
  /** Whether the symlink dir requires sudo */
  needsSudo: boolean;
}

const GITHUB_OWNER = 'lucmousinho';
const GITHUB_REPO = 'mother-brain';

export { GITHUB_OWNER, GITHUB_REPO };

export function detectPlatform(): PlatformInfo {
  const os = platform();
  const cpuArch = arch();

  if (os !== 'darwin' && os !== 'linux') {
    throw new Error(`Unsupported OS: ${os}. Only darwin and linux are supported.`);
  }

  let resolvedArch: 'x64' | 'arm64';
  if (cpuArch === 'x64' || cpuArch === 'x86_64') {
    resolvedArch = 'x64';
  } else if (cpuArch === 'arm64' || cpuArch === 'aarch64') {
    resolvedArch = 'arm64';
  } else {
    throw new Error(`Unsupported architecture: ${cpuArch}. Only x64 and arm64 are supported.`);
  }

  return { os, arch: resolvedArch };
}

export function resolveAssetName(version: string, plat: PlatformInfo): string {
  const v = version.startsWith('v') ? version : `v${version}`;
  return `motherbrain-${v}-${plat.os}-${plat.arch}.tar.gz`;
}

export function resolveChecksumName(version: string): string {
  const v = version.startsWith('v') ? version : `v${version}`;
  return `motherbrain-${v}-checksums.txt`;
}

export function resolveDownloadUrl(version: string, assetName: string): string {
  const v = version.startsWith('v') ? version : `v${version}`;
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${v}/${assetName}`;
}

export function detectInstallInfo(): InstallInfo {
  const bundleHome = process.env.MB_HOME || join(homedir(), '.motherbrain');
  const currentDir = join(bundleHome, 'current');

  // Try to find the symlink
  let symlinkPath: string | null = null;
  let needsSudo = false;

  try {
    const whichOutput = execSync('which motherbrain', { stdio: 'pipe', encoding: 'utf-8' }).trim();
    if (whichOutput) {
      symlinkPath = whichOutput;
      const symlinkDir = dirname(whichOutput);
      // Check if we can write to that directory
      try {
        execSync(`test -w "${symlinkDir}"`, { stdio: 'pipe' });
      } catch {
        needsSudo = true;
      }
    }
  } catch {
    // motherbrain not in PATH — might be running from source
  }

  // Determine if this is a bundle install
  let isBundleInstall = existsSync(currentDir);

  if (symlinkPath && !isBundleInstall) {
    // Check if the symlink resolves into the bundle home
    try {
      const resolved = realpathSync(symlinkPath);
      if (resolved.includes('.motherbrain')) {
        isBundleInstall = true;
      }
    } catch {
      // ignore
    }
  }

  return {
    symlinkPath,
    bundleHome,
    currentDir,
    isBundleInstall,
    needsSudo,
  };
}

/**
 * Compare two semver strings. Returns:
 * - negative if a < b
 * - 0 if a == b
 * - positive if a > b
 */
export function compareSemver(a: string, b: string): number {
  const parseVer = (v: string): number[] => {
    const clean = v.replace(/^v/, '');
    return clean.split('.').map((n) => parseInt(n, 10) || 0);
  };

  const pa = parseVer(a);
  const pb = parseVer(b);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }

  return 0;
}
