import { describe, it, expect } from 'vitest';
import { RunCheckpointSchema, NodeSchema, PolicyCheckSchema } from '../src/core/schemas.js';

describe('RunCheckpointSchema', () => {
  it('should validate a valid checkpoint', () => {
    const input = {
      agent: { id: 'agent_01', name: 'Test Agent' },
      intent: { goal: 'Test goal' },
      result: { status: 'success', summary: 'Done' },
    };
    const result = RunCheckpointSchema.parse(input);
    expect(result.version).toBe('v1');
    expect(result.agent.id).toBe('agent_01');
    expect(result.intent.goal).toBe('Test goal');
    expect(result.result.status).toBe('success');
    expect(result.actions).toEqual([]);
    expect(result.files_touched).toEqual([]);
  });

  it('should reject missing agent', () => {
    const input = {
      intent: { goal: 'Test' },
      result: { status: 'success', summary: 'Done' },
    };
    expect(() => RunCheckpointSchema.parse(input)).toThrow();
  });

  it('should reject missing intent', () => {
    const input = {
      agent: { id: 'a', name: 'A' },
      result: { status: 'success', summary: 'Done' },
    };
    expect(() => RunCheckpointSchema.parse(input)).toThrow();
  });

  it('should reject invalid result status', () => {
    const input = {
      agent: { id: 'a', name: 'A' },
      intent: { goal: 'Test' },
      result: { status: 'invalid', summary: 'Done' },
    };
    expect(() => RunCheckpointSchema.parse(input)).toThrow();
  });

  it('should accept full checkpoint with all fields', () => {
    const input = {
      version: 'v1',
      run_id: 'run_test123',
      timestamp: '2025-01-15T10:00:00Z',
      agent: { id: 'agent_01', name: 'Coder', session_id: 'sess_1' },
      intent: { goal: 'Deploy', context: ['sprint 12'] },
      plan: [{ step: 1, description: 'Pull', status: 'done' }],
      actions: [{ type: 'command', command: 'git pull' }],
      files_touched: ['src/main.ts'],
      artifacts: [{ type: 'log', content: 'ok' }],
      result: { status: 'success', summary: 'Deployed' },
      constraints_applied: ['c1'],
      risk_flags: ['rf1'],
      links: { nodes: ['task_1'] },
      tags: ['deploy'],
    };
    const result = RunCheckpointSchema.parse(input);
    expect(result.run_id).toBe('run_test123');
    expect(result.links.nodes).toEqual(['task_1']);
  });
});

describe('NodeSchema', () => {
  it('should validate a valid node', () => {
    const input = {
      id: 'task_001',
      type: 'task',
      title: 'Deploy staging',
    };
    const result = NodeSchema.parse(input);
    expect(result.status).toBe('active');
    expect(result.tags).toEqual([]);
  });

  it('should reject invalid type', () => {
    const input = {
      id: 'x',
      type: 'invalid_type',
      title: 'Test',
    };
    expect(() => NodeSchema.parse(input)).toThrow();
  });

  it('should reject empty title', () => {
    const input = {
      id: 'x',
      type: 'task',
      title: '',
    };
    expect(() => NodeSchema.parse(input)).toThrow();
  });
});

describe('PolicyCheckSchema', () => {
  it('should validate cmd check', () => {
    const result = PolicyCheckSchema.parse({ cmd: 'git push' });
    expect(result.cmd).toBe('git push');
  });

  it('should validate path check', () => {
    const result = PolicyCheckSchema.parse({ path: '/etc/passwd' });
    expect(result.path).toBe('/etc/passwd');
  });

  it('should allow empty object', () => {
    const result = PolicyCheckSchema.parse({});
    expect(result.cmd).toBeUndefined();
  });
});
