import { GITHUB_OWNER, GITHUB_REPO } from './updater.platform.js';

const API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'motherbrain-cli-updater';

export interface ReleaseInfo {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const url = `${API_BASE}/releases/latest`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('No releases found. The repository may not have any published releases yet.');
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as ReleaseInfo;
  return data;
}

export async function fetchRelease(tag: string): Promise<ReleaseInfo> {
  const v = tag.startsWith('v') ? tag : `v${tag}`;
  const url = `${API_BASE}/releases/tags/${v}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Release ${v} not found.`);
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as ReleaseInfo;
  return data;
}

export async function downloadToFile(url: string, destPath: string): Promise<void> {
  const { createWriteStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText} — ${url}`);
  }

  if (!response.body) {
    throw new Error('No response body received.');
  }

  const fileStream = createWriteStream(destPath);
  // Convert web ReadableStream to node Readable
  const { Readable } = await import('node:stream');
  const nodeStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  await pipeline(nodeStream, fileStream);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/vnd.github+json',
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
