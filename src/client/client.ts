/**
 * Mother Brain Client SDK
 *
 * A lightweight, zero-dependency HTTP client for any agent that needs to
 * talk to a running Mother Brain API instance.
 *
 * Features:
 *  - configurable timeout per request
 *  - auth header injection (X-MB-TOKEN)
 *  - cached /health probes to avoid hammering the server
 *  - onUnavailable policy (skip | warn | throw)
 *  - context header forwarding (X-MB-CONTEXT)
 */

import type {
  MotherBrainClientConfig,
  UnavailablePolicy,
  RecallOptions,
  RecallResponse,
  PolicyCheckRequest,
  PolicyCheckResponse,
  HealthResponse,
  RecordCheckpointPayload,
  RecordCheckpointResponse,
} from './types.js';

// ── Defaults ──────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_HEALTH_CACHE_TTL_MS = 30_000;
const DEFAULT_UNAVAILABLE_POLICY: UnavailablePolicy = 'skip';

// ── Helpers ───────────────────────────────────────────────────────────

/** A minimal AbortController-based timeout wrapper around fetch. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Client ────────────────────────────────────────────────────────────

export class MotherBrainClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly healthCacheTtlMs: number;
  private readonly onUnavailable: UnavailablePolicy;
  private readonly contextId: string | undefined;

  /** Cached health result + timestamp */
  private healthCache: { healthy: boolean; checkedAt: number } | null = null;

  constructor(config: MotherBrainClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.healthCacheTtlMs = config.healthCacheTtlMs ?? DEFAULT_HEALTH_CACHE_TTL_MS;
    this.onUnavailable = config.onUnavailable ?? DEFAULT_UNAVAILABLE_POLICY;
    this.contextId = config.contextId;
  }

  // ── Public API ────────────────────────────────────────────────────

  /** Probe /health with a short timeout. Result is cached for `healthCacheTtlMs`. */
  async isHealthy(): Promise<boolean> {
    const now = Date.now();
    if (this.healthCache && now - this.healthCache.checkedAt < this.healthCacheTtlMs) {
      return this.healthCache.healthy;
    }

    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/health`,
        { method: 'GET' },
        Math.min(this.timeoutMs, 3_000),
      );
      const healthy = res.ok;
      this.healthCache = { healthy, checkedAt: now };
      return healthy;
    } catch {
      this.healthCache = { healthy: false, checkedAt: now };
      return false;
    }
  }

  /** Invalidate the cached health state so the next call re-probes. */
  invalidateHealthCache(): void {
    this.healthCache = null;
  }

  /** Full health response (bypasses cache). */
  async health(): Promise<HealthResponse> {
    const res = await this.request<HealthResponse>('GET', '/health');
    return res;
  }

  /** Semantic / keyword / hybrid recall. */
  async recall(opts: RecallOptions): Promise<RecallResponse | null> {
    const params = new URLSearchParams({ q: opts.query });
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.tags?.length) params.set('tags', opts.tags.join(','));
    if (opts.types?.length) params.set('types', opts.types.join(','));
    if (opts.mode) params.set('mode', opts.mode);
    if (opts.contextId) params.set('context_id', opts.contextId);
    if (opts.contextIds?.length) params.set('context_ids', opts.contextIds.join(','));

    return this.safeRequest<RecallResponse>('GET', `/recall?${params.toString()}`);
  }

  /** Record a run checkpoint. */
  async recordCheckpoint(
    payload: RecordCheckpointPayload,
  ): Promise<RecordCheckpointResponse | null> {
    return this.safeRequest<RecordCheckpointResponse>('POST', '/runs', payload);
  }

  /** Policy check for a command / path / host. */
  async policyCheck(req: PolicyCheckRequest): Promise<PolicyCheckResponse | null> {
    return this.safeRequest<PolicyCheckResponse>('POST', '/policy/check', req);
  }

  // ── Internals ─────────────────────────────────────────────────────

  /** Low-level request that always throws on failure. */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (this.token) {
      headers['X-MB-TOKEN'] = this.token;
    }
    if (this.contextId) {
      headers['X-MB-CONTEXT'] = this.contextId;
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetchWithTimeout(
      `${this.baseUrl}${path}`,
      {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      this.timeoutMs,
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new MotherBrainApiError(res.status, text, path);
    }

    return (await res.json()) as T;
  }

  /**
   * Request wrapper that applies the `onUnavailable` policy.
   * Returns `null` when the request is skipped or warned-through.
   */
  private async safeRequest<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    try {
      return await this.request<T>(method, path, body);
    } catch (err) {
      return this.handleUnavailable<T>(err);
    }
  }

  private handleUnavailable<T>(err: unknown): T | null {
    // Invalidate health cache on any connectivity failure
    this.invalidateHealthCache();

    switch (this.onUnavailable) {
      case 'throw':
        throw err;

      case 'warn':
        console.warn(
          `[mother-brain] unavailable: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;

      case 'skip':
      default:
        return null;
    }
  }
}

// ── Error class ─────────────────────────────────────────────────────

export class MotherBrainApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string,
  ) {
    super(`Mother Brain API error ${status} on ${path}: ${body}`);
    this.name = 'MotherBrainApiError';
  }
}
