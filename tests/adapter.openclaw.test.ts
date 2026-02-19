import { describe, it, expect } from 'vitest';
import { openClawToCheckpoint } from '../src/adapters/openclaw/adapter.js';
import type { OpenClawEvent } from '../src/adapters/openclaw/types.js';

describe('openClawToCheckpoint', () => {
  const baseEvent: OpenClawEvent = {
    type: 'action',
    agent_id: 'agent-oc-1',
    session: 'session_abc',
    timestamp: '2025-06-15T10:00:00.000Z',
    action: {
      tool: 'bash',
      command: 'ls -la',
      result: 'file1.txt\nfile2.txt',
    },
    memory_refs: ['ref_1', 'ref_2'],
  };

  it('should map agent fields correctly', () => {
    const cp = openClawToCheckpoint(baseEvent);
    expect(cp.agent.id).toBe('agent-oc-1');
    expect(cp.agent.name).toBe('OpenClaw Agent');
    expect(cp.agent.session_id).toBe('session_abc');
  });

  it('should set intent from tool and command', () => {
    const cp = openClawToCheckpoint(baseEvent);
    expect(cp.intent.goal).toBe('bash: ls -la');
    expect(cp.intent.context).toEqual(['ref_1', 'ref_2']);
  });

  it('should map action correctly', () => {
    const cp = openClawToCheckpoint(baseEvent);
    expect(cp.actions).toHaveLength(1);
    expect(cp.actions[0].type).toBe('bash');
    expect(cp.actions[0].command).toBe('ls -la');
  });

  it('should detect success status', () => {
    const cp = openClawToCheckpoint(baseEvent);
    expect(cp.result.status).toBe('success');
  });

  it('should detect failure from error in result', () => {
    const errorEvent = {
      ...baseEvent,
      action: { ...baseEvent.action, result: 'Error: command not found' },
    } as OpenClawEvent;
    const cp = openClawToCheckpoint(errorEvent);
    expect(cp.result.status).toBe('failure');
  });

  it('should include openclaw tag', () => {
    const cp = openClawToCheckpoint(baseEvent);
    expect(cp.tags).toContain('openclaw');
    expect(cp.tags).toContain('bash');
  });

  it('should set version to v1', () => {
    const cp = openClawToCheckpoint(baseEvent);
    expect(cp.version).toBe('v1');
  });

  it('should handle missing memory_refs', () => {
    const event: OpenClawEvent = {
      type: 'action',
      agent_id: 'a1',
      session: 's1',
      timestamp: new Date().toISOString(),
      action: { tool: 'read', command: 'file.txt', result: 'content' },
    };
    const cp = openClawToCheckpoint(event);
    expect(cp.intent.context).toEqual([]);
  });
});
