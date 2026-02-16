/**
 * Mother Brain Client SDK — shared types.
 *
 * These are the public-facing types that any agent integration imports.
 * They mirror the API surface but stay decoupled from the internal core
 * schemas so the SDK can be used as a standalone HTTP client.
 */

// ── Configuration ─────────────────────────────────────────────────────

export type UnavailablePolicy = 'skip' | 'warn' | 'throw';

export interface MotherBrainClientConfig {
  /** Base URL including port, e.g. "http://127.0.0.1:7337" */
  baseUrl: string;

  /** Bearer / token value sent as X-MB-TOKEN header */
  token?: string;

  /** Request timeout in milliseconds (default 5 000) */
  timeoutMs?: number;

  /** How long a successful health probe is trusted, in ms (default 30 000) */
  healthCacheTtlMs?: number;

  /**
   * Behaviour when Mother Brain is unreachable:
   *  - `skip`  — return a neutral fallback silently (default)
   *  - `warn`  — return a neutral fallback and log a warning
   *  - `throw` — propagate the error
   */
  onUnavailable?: UnavailablePolicy;

  /** Optional context ID sent via X-MB-CONTEXT on every request */
  contextId?: string;
}

// ── Request / Response DTOs ───────────────────────────────────────────

export interface RecallOptions {
  query: string;
  limit?: number;
  tags?: string[];
  types?: string[];
  mode?: 'keyword' | 'semantic' | 'hybrid';
  contextId?: string;
  contextIds?: string[];
}

export interface RecallRunSummary {
  run_id: string;
  timestamp: string;
  agent_id: string;
  goal: string;
  summary: string;
  status: string;
  score: number;
  similarity_score?: number;
}

export interface RecallNodeSummary {
  node_id: string;
  type: string;
  title: string;
  status: string;
  tags: string[];
  score: number;
  similarity_score?: number;
}

export interface RecallResponse {
  query: string;
  mode: string;
  source: string;
  top_runs: RecallRunSummary[];
  top_nodes: RecallNodeSummary[];
  applicable_constraints: string[];
  suggested_next_actions: string[];
}

export interface PolicyCheckRequest {
  cmd?: string;
  path?: string;
  host?: string;
  agent_id?: string;
}

export interface PolicyCheckResponse {
  allowed: boolean;
  reason: string;
  checks: Array<{
    dimension: string;
    value: string;
    allowed: boolean;
    matched_rule: string;
  }>;
}

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

export interface RecordCheckpointPayload {
  version?: string;
  agent: { id: string; name: string; session_id?: string };
  intent: { goal: string; context?: string[] };
  plan?: Array<{ step: number; description: string; status?: string }>;
  actions?: Array<{
    type: string;
    command?: string;
    path?: string;
    host?: string;
    detail?: string;
    timestamp?: string;
  }>;
  files_touched?: string[];
  artifacts?: Array<{ type: string; path?: string; content?: string; url?: string }>;
  result: { status: 'success' | 'failure' | 'partial' | 'aborted'; summary: string };
  constraints_applied?: string[];
  risk_flags?: string[];
  links?: { nodes?: string[] };
  tags?: string[];
  context_id?: string;
}

export interface RecordCheckpointResponse {
  run_id: string;
  file_path: string;
  linked_nodes: string[];
}
