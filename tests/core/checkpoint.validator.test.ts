import { describe, it, expect } from 'vitest';
import { CheckpointValidator } from '../../src/core/checkpoint.validator.js';
import type { RunCheckpoint } from '../../src/core/schemas.js';

describe('CheckpointValidator', () => {
  const validator = new CheckpointValidator();

  const validCheckpoint: RunCheckpoint = {
    run_id: 'run_test123',
    timestamp: '2026-02-21T03:00:00Z',
    agent: {
      id: 'test-agent',
      name: 'Test Agent',
    },
    intent: {
      goal: 'Test goal with sufficient length',
      summary: 'This is a valid summary with more than 20 characters',
      command: 'test-command',
    },
    result: {
      status: 'success',
      output: 'Test output',
      summary: 'Completed successfully',
    },
    context_id: 'test-context',
    tags: ['test', 'validation'],
    links: { nodes: [] },
    files_touched: [],
    risk_flags: [],
  };

  it('validates a correct checkpoint', () => {
    const result = validator.validate(validCheckpoint);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('catches missing agent.id', () => {
    const invalid = { ...validCheckpoint, agent: { name: 'Test' } } as RunCheckpoint;
    const result = validator.validate(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'agent.id',
      message: 'Agent ID is required',
      severity: 'error',
    });
  });

  it('catches missing agent.name', () => {
    const invalid = { ...validCheckpoint, agent: { id: 'test' } } as RunCheckpoint;
    const result = validator.validate(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'agent.name',
      message: 'Agent name is required',
      severity: 'error',
    });
  });

  it('catches missing intent.goal', () => {
    const invalid = {
      ...validCheckpoint,
      intent: { summary: 'test', command: 'test' },
    } as RunCheckpoint;
    const result = validator.validate(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'intent.goal',
      message: 'Goal is required',
      severity: 'error',
    });
  });

  it('catches success without output', () => {
    const invalid = {
      ...validCheckpoint,
      result: { status: 'success', summary: 'test' },
    } as RunCheckpoint;
    const result = validator.validate(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'result.output',
      message: 'Success status requires output',
      severity: 'error',
    });
  });

  it('warns about short summary', () => {
    const short = {
      ...validCheckpoint,
      intent: { ...validCheckpoint.intent, summary: 'short' },
    };
    const result = validator.validate(short);

    expect(result.valid).toBe(true); // warnings don't block
    expect(result.warnings.some((w) => w.field === 'intent.summary')).toBe(true);
  });

  it('warns about missing context_id', () => {
    const noContext = { ...validCheckpoint, context_id: undefined } as RunCheckpoint;
    const result = validator.validate(noContext);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.field === 'context_id')).toBe(true);
  });

  it('warns about missing tags', () => {
    const noTags = { ...validCheckpoint, tags: [] };
    const result = validator.validate(noTags);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.field === 'tags')).toBe(true);
  });

  it('warns about too many tags', () => {
    const manyTags = {
      ...validCheckpoint,
      tags: Array(25)
        .fill(0)
        .map((_, i) => `tag${i}`),
    };
    const result = validator.validate(manyTags);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.field === 'tags')).toBe(true);
  });

  it('warns about risk flags present', () => {
    const withRisk = {
      ...validCheckpoint,
      risk_flags: ['security', 'performance'],
    };
    const result = validator.validate(withRisk);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.field === 'risk_flags')).toBe(true);
  });

  it('warns about too many files touched', () => {
    const manyFiles = {
      ...validCheckpoint,
      files_touched: Array(60)
        .fill(0)
        .map((_, i) => `file${i}.ts`),
    };
    const result = validator.validate(manyFiles);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.field === 'files_touched')).toBe(true);
  });

  it('formats result correctly', () => {
    const invalid = { ...validCheckpoint, agent: {} } as RunCheckpoint;
    const result = validator.validate(invalid);
    const formatted = validator.formatResult(result);

    expect(formatted).toContain('❌ Checkpoint validation failed');
    expect(formatted).toContain('Errors:');
  });

  it('validateOrThrow succeeds for valid checkpoint', () => {
    expect(() => validator.validateOrThrow(validCheckpoint)).not.toThrow();
  });

  it('validateOrThrow throws for invalid checkpoint', () => {
    const invalid = { ...validCheckpoint, agent: {} } as RunCheckpoint;

    expect(() => validator.validateOrThrow(invalid)).toThrow(
      'Checkpoint validation failed'
    );
  });
});
