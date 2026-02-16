/**
 * OpenClaw Lifecycle Hooks
 *
 * Provides the four integration points that plug into OpenClaw's agent loop:
 *
 *   beforeAction(task)   — recall relevant memory before executing a task
 *   checkPolicy(command) — gate a command through Mother Brain's policy engine
 *   afterAction(event)   — record a checkpoint after an action completes
 *   healthCheck()        — cached health probe (safe to call frequently)
 *
 * All hooks are designed to be non-blocking and resilient: when Mother Brain
 * is unavailable the configured `onUnavailable` policy kicks in (default: skip).
 */

import { MotherBrainClient } from '../../client/client.js';
import type {
  RecallResponse,
  PolicyCheckResponse,
  RecordCheckpointResponse,
  UnavailablePolicy,
} from '../../client/types.js';
import { openClawToCheckpoint } from './adapter.js';
import type { OpenClawEvent, OpenClawTask, OpenClawCommand, OpenClawAdapterConfig } from './types.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:7337';
const DEFAULT_AGENT_NAME = 'OpenClaw Agent';

export class OpenClawHooks {
  private readonly client: MotherBrainClient;
  private readonly agentId: string;
  private readonly agentName: string;
  private readonly contextId: string | undefined;

  constructor(config: OpenClawAdapterConfig = {}) {
    this.agentId = config.agentId ?? 'openclaw';
    this.agentName = config.agentName ?? DEFAULT_AGENT_NAME;
    this.contextId = config.contextId;

    this.client = new MotherBrainClient({
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      token: config.token,
      timeoutMs: config.timeoutMs,
      healthCacheTtlMs: config.healthCacheTtlMs,
      onUnavailable: config.onUnavailable ?? 'skip',
      contextId: config.contextId,
    });
  }

  /**
   * Create an OpenClawHooks instance from environment variables.
   *
   * This is the recommended way to instantiate the integration — just set
   * the env vars and call `OpenClawHooks.fromEnv()`. Any value not set
   * in the environment falls back to its default.
   *
   * Supported env vars (both prefixes are accepted):
   *   MOTHERBRAIN_API_URL / MB_URL
   *   MOTHERBRAIN_TOKEN / MB_TOKEN
   *   MOTHERBRAIN_TIMEOUT_MS / MB_TIMEOUT_MS
   *   MOTHERBRAIN_HEALTH_CACHE_MS / MB_HEALTH_CACHE_MS
   *   MOTHERBRAIN_ON_UNAVAILABLE / MB_ON_UNAVAILABLE
   *   MOTHERBRAIN_AGENT_ID / MB_AGENT_ID
   *   MOTHERBRAIN_AGENT_NAME / MB_AGENT_NAME
   *   MOTHERBRAIN_CONTEXT_ID / MB_CONTEXT_ID
   */
  static fromEnv(overrides: Partial<OpenClawAdapterConfig> = {}): OpenClawHooks {
    const env = typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>);

    const parseUnavailable = (val: string | undefined): UnavailablePolicy | undefined => {
      if (val === 'skip' || val === 'warn' || val === 'throw') return val;
      return undefined;
    };

    return new OpenClawHooks({
      baseUrl:
        overrides.baseUrl ?? env.MOTHERBRAIN_API_URL ?? env.MB_URL ?? undefined,
      token: overrides.token ?? env.MOTHERBRAIN_TOKEN ?? env.MB_TOKEN ?? undefined,
      timeoutMs:
        overrides.timeoutMs ??
        (env.MOTHERBRAIN_TIMEOUT_MS
          ? Number(env.MOTHERBRAIN_TIMEOUT_MS)
          : env.MB_TIMEOUT_MS
            ? Number(env.MB_TIMEOUT_MS)
            : undefined),
      healthCacheTtlMs:
        overrides.healthCacheTtlMs ??
        (env.MOTHERBRAIN_HEALTH_CACHE_MS
          ? Number(env.MOTHERBRAIN_HEALTH_CACHE_MS)
          : env.MB_HEALTH_CACHE_MS
            ? Number(env.MB_HEALTH_CACHE_MS)
            : undefined),
      onUnavailable:
        overrides.onUnavailable ??
        parseUnavailable(env.MOTHERBRAIN_ON_UNAVAILABLE ?? env.MB_ON_UNAVAILABLE),
      agentId: overrides.agentId ?? env.MOTHERBRAIN_AGENT_ID ?? env.MB_AGENT_ID ?? undefined,
      agentName:
        overrides.agentName ?? env.MOTHERBRAIN_AGENT_NAME ?? env.MB_AGENT_NAME ?? undefined,
      contextId:
        overrides.contextId ?? env.MOTHERBRAIN_CONTEXT_ID ?? env.MB_CONTEXT_ID ?? undefined,
    });
  }

  // ── Lifecycle hooks ───────────────────────────────────────────────

  /**
   * Called before an agent action.
   *
   * Queries Mother Brain's recall endpoint to retrieve relevant past runs,
   * knowledge nodes, constraints, and suggested next actions. The result
   * can be injected into the agent's context window so it has full history
   * before deciding what to do.
   *
   * Returns `null` when Mother Brain is unavailable (safe fallback).
   */
  async beforeAction(task: OpenClawTask): Promise<RecallResponse | null> {
    return this.client.recall({
      query: task.description,
      limit: task.limit ?? 5,
      tags: task.tags,
      contextId: this.contextId,
    });
  }

  /**
   * Called to validate a command before execution.
   *
   * Passes the command through Mother Brain's policy gate (deny/allow lists).
   * Returns `null` when unavailable — caller should treat `null` as "allowed"
   * to avoid blocking the agent when Mother Brain is down.
   */
  async checkPolicy(command: OpenClawCommand): Promise<PolicyCheckResponse | null> {
    return this.client.policyCheck({
      cmd: command.cmd,
      path: command.path,
      host: command.host,
      agent_id: command.agent_id ?? this.agentId,
    });
  }

  /**
   * Called after an action completes.
   *
   * Converts an OpenClaw event into a Mother Brain RunCheckpoint and records
   * it. This is fire-and-forget by default — failures are absorbed by the
   * onUnavailable policy.
   */
  async afterAction(event: OpenClawEvent): Promise<RecordCheckpointResponse | null> {
    const checkpoint = openClawToCheckpoint(event);
    return this.client.recordCheckpoint({
      version: checkpoint.version,
      agent: checkpoint.agent,
      intent: checkpoint.intent,
      plan: checkpoint.plan,
      actions: checkpoint.actions,
      files_touched: checkpoint.files_touched,
      artifacts: checkpoint.artifacts,
      result: checkpoint.result,
      constraints_applied: checkpoint.constraints_applied,
      risk_flags: checkpoint.risk_flags,
      links: checkpoint.links,
      tags: checkpoint.tags,
      context_id: this.contextId,
    });
  }

  /**
   * Cached health probe.
   *
   * Safe to call on every heartbeat/cron tick — result is cached for
   * `healthCacheTtlMs` (default 30 s) so it won't flood the server.
   */
  async healthCheck(): Promise<boolean> {
    return this.client.isHealthy();
  }

  /** Expose the underlying client for advanced use cases. */
  getClient(): MotherBrainClient {
    return this.client;
  }
}
