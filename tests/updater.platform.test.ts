import { describe, it, expect } from 'vitest';
import {
  detectPlatform,
  resolveAssetName,
  resolveChecksumName,
  resolveDownloadUrl,
  compareSemver,
  GITHUB_OWNER,
  GITHUB_REPO,
} from '../src/core/update/updater.platform.js';

describe('detectPlatform', () => {
  it('should return a valid OS and arch', () => {
    const plat = detectPlatform();

    expect(['darwin', 'linux']).toContain(plat.os);
    expect(['x64', 'arm64']).toContain(plat.arch);
  });
});

describe('resolveAssetName', () => {
  it('should build correct tarball name with v prefix', () => {
    const name = resolveAssetName('v0.2.0', { os: 'darwin', arch: 'arm64' });
    expect(name).toBe('motherbrain-v0.2.0-darwin-arm64.tar.gz');
  });

  it('should add v prefix if missing', () => {
    const name = resolveAssetName('0.2.0', { os: 'linux', arch: 'x64' });
    expect(name).toBe('motherbrain-v0.2.0-linux-x64.tar.gz');
  });

  it('should handle all platform combinations', () => {
    const combos = [
      { os: 'darwin' as const, arch: 'arm64' as const },
      { os: 'darwin' as const, arch: 'x64' as const },
      { os: 'linux' as const, arch: 'arm64' as const },
      { os: 'linux' as const, arch: 'x64' as const },
    ];

    for (const plat of combos) {
      const name = resolveAssetName('v1.0.0', plat);
      expect(name).toMatch(/^motherbrain-v1\.0\.0-(darwin|linux)-(x64|arm64)\.tar\.gz$/);
    }
  });
});

describe('resolveChecksumName', () => {
  it('should build correct checksum filename', () => {
    expect(resolveChecksumName('v0.2.0')).toBe('motherbrain-v0.2.0-checksums.txt');
  });

  it('should add v prefix if missing', () => {
    expect(resolveChecksumName('0.2.0')).toBe('motherbrain-v0.2.0-checksums.txt');
  });
});

describe('resolveDownloadUrl', () => {
  it('should build correct GitHub release URL', () => {
    const url = resolveDownloadUrl('v0.2.0', 'motherbrain-v0.2.0-darwin-arm64.tar.gz');
    expect(url).toBe(
      `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.2.0/motherbrain-v0.2.0-darwin-arm64.tar.gz`,
    );
  });

  it('should use HTTPS', () => {
    const url = resolveDownloadUrl('v1.0.0', 'test.tar.gz');
    expect(url).toMatch(/^https:\/\//);
  });
});

describe('compareSemver', () => {
  it('should return 0 for equal versions', () => {
    expect(compareSemver('v0.1.0', 'v0.1.0')).toBe(0);
    expect(compareSemver('0.1.0', '0.1.0')).toBe(0);
    expect(compareSemver('v1.0.0', '1.0.0')).toBe(0);
  });

  it('should detect newer major version', () => {
    expect(compareSemver('v2.0.0', 'v1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('v1.0.0', 'v2.0.0')).toBeLessThan(0);
  });

  it('should detect newer minor version', () => {
    expect(compareSemver('v0.2.0', 'v0.1.0')).toBeGreaterThan(0);
    expect(compareSemver('v0.1.0', 'v0.2.0')).toBeLessThan(0);
  });

  it('should detect newer patch version', () => {
    expect(compareSemver('v0.1.1', 'v0.1.0')).toBeGreaterThan(0);
    expect(compareSemver('v0.1.0', 'v0.1.1')).toBeLessThan(0);
  });

  it('should handle version with and without v prefix', () => {
    expect(compareSemver('v1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('v1.2.3', '1.2.2')).toBeGreaterThan(0);
  });

  it('should handle missing patch component', () => {
    expect(compareSemver('v1.0', 'v1.0.0')).toBe(0);
  });
});

describe('constants', () => {
  it('should have correct GitHub owner and repo', () => {
    expect(GITHUB_OWNER).toBe('lucmousinho');
    expect(GITHUB_REPO).toBe('mother-brain');
  });
});
