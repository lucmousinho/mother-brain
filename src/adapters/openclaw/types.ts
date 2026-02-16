/**
 * OpenClaw-specific types used by the adapter and hooks.
 */

/** Raw event emitted by the OpenClaw agent loop. */
export interface OpenClawEvent {
  type: string;
  agent_id: string;
  session: string;
  timestamp: string;
  action: {
    tool: string;
    command?: string;
    result?: string;
  };
  memory_refs?: string[];
}

/** Task descriptor passed to beforeAction for pre-flight recall. */
export interface OpenClawTask {
  /** Free-text description of what the agent is about to do */
  description: string;
  /** Optional tags to narrow the recall search */
  tags?: string[];
  /** Max recall results (default 5) */
  limit?: number;
}

/** Command descriptor passed to checkPolicy. */
export interface OpenClawCommand {
  cmd?: string;
  path?: string;
  host?: string;
  agent_id?: string;
}

/** Configuration for the OpenClaw ↔ Mother Brain integration. */
export interface OpenClawAdapterConfig {
  /** Mother Brain base URL (default: http://127.0.0.1:7337) */
  baseUrl?: string;
  /** Auth token */
  token?: string;
  /** Request timeout in ms (default 5000) */
  timeoutMs?: number;
  /** Health cache TTL in ms (default 30000) */
  healthCacheTtlMs?: number;
  /** What happens when Mother Brain is down: skip | warn | throw (default skip) */
  onUnavailable?: 'skip' | 'warn' | 'throw';
  /** Default agent ID if not provided per-event */
  agentId?: string;
  /** Default agent name (default "OpenClaw Agent") */
  agentName?: string;
  /** Default context ID for scoped memory */
  contextId?: string;
}
