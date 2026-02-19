import { describe, it, expect } from 'vitest';
import { seedRecord, TABLE_NAME, DEFAULT_DIMENSIONS } from '../src/core/vectorstore/lancedb.schema.js';
import type { VectorDoc } from '../src/core/vectorstore/vector.types.js';

describe('lancedb schema', () => {
  it('should have correct table name', () => {
    expect(TABLE_NAME).toBe('knowledge');
  });

  it('should have correct default dimensions', () => {
    expect(DEFAULT_DIMENSIONS).toBe(384);
  });

  it('should create a seed record with correct shape', () => {
    const seed = seedRecord();

    expect(seed.id).toBe('__seed__');
    expect(seed.kind).toBe('node');
    expect(seed.ref_id).toBe('__seed__');
    expect(seed.vector).toHaveLength(384);
    expect(seed.vector.every((v) => v === 0)).toBe(true);
    expect(seed.text).toBe('');
    expect(seed.tags_json).toBe('[]');
    expect(seed.type).toBe('');
    expect(seed.status).toBe('');
    expect(typeof seed.updated_at).toBe('string');
  });

  it('should allow custom dimensions', () => {
    const seed = seedRecord(768);
    expect(seed.vector).toHaveLength(768);
  });
});

describe('vector types', () => {
  it('should accept valid VectorDoc shape', () => {
    const doc: VectorDoc = {
      id: 'run_test1',
      kind: 'run',
      ref_id: 'run_test1',
      vector: new Array(384).fill(0.1),
      text: 'test document',
      tags_json: '["test"]',
      type: 'run',
      status: 'success',
      updated_at: new Date().toISOString(),
      context_id: '__global__',
      scope_path: '__global__',
    };

    expect(doc.kind).toBe('run');
    expect(doc.vector).toHaveLength(384);
    expect(doc.context_id).toBe('__global__');
    expect(doc.scope_path).toBe('__global__');
  });
});
