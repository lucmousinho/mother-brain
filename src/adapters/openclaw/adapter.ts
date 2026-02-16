import type { RunCheckpoint } from '../../core/schemas.js';
import type { OpenClawEvent } from './types.js';

/**
 * Maps an OpenClaw agent event to a Mother Brain RunCheckpoint.
 *
 * The `OpenClawEvent` type is defined in `./types.ts` so it can be shared
 * across the mapper and the lifecycle hooks without circular imports.
 */
export function openClawToCheckpoint(event: OpenClawEvent): Omit<RunCheckpoint, 'run_id'> {
  return {
    version: 'v1',
    timestamp: event.timestamp,
    agent: {
      id: event.agent_id,
      name: 'OpenClaw Agent',
      session_id: event.session,
    },
    intent: {
      goal: `${event.action.tool}: ${event.action.command || 'unknown'}`,
      context: event.memory_refs || [],
    },
    plan: [
      {
        step: 1,
        description: `Execute ${event.action.tool}`,
        status: 'done',
      },
    ],
    actions: [
      {
        type: event.action.tool,
        command: event.action.command,
        detail: event.action.result,
        timestamp: event.timestamp,
      },
    ],
    files_touched: [],
    artifacts: [],
    result: {
      status: event.action.result?.toLowerCase().includes('error') ? 'failure' : 'success',
      summary: event.action.result || 'Completed',
    },
    constraints_applied: [],
    risk_flags: [],
    links: { nodes: [] },
    tags: ['openclaw', event.action.tool],
  };
}
