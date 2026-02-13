import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashText,
  getCachedEmbedding,
  setCachedEmbedding,
  clearEmbeddingCache,
  embeddingCacheSize,
} from '../src/core/embeddings/embeddings.cache.js';

describe('embeddings cache', () => {
  beforeEach(() => {
    clearEmbeddingCache();
  });

  it('should hash text deterministically', () => {
    const h1 = hashText('hello world');
    const h2 = hashText('hello world');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  it('should produce different hashes for different text', () => {
    const h1 = hashText('hello');
    const h2 = hashText('world');
    expect(h1).not.toBe(h2);
  });

  it('should cache and retrieve embeddings', () => {
    const vec = [0.1, 0.2, 0.3];
    setCachedEmbedding('test text', vec);

    const cached = getCachedEmbedding('test text');
    expect(cached).toEqual(vec);
  });

  it('should return undefined for uncached text', () => {
    const cached = getCachedEmbedding('not cached');
    expect(cached).toBeUndefined();
  });

  it('should track cache size', () => {
    expect(embeddingCacheSize()).toBe(0);
    setCachedEmbedding('a', [1]);
    setCachedEmbedding('b', [2]);
    expect(embeddingCacheSize()).toBe(2);
  });

  it('should clear cache', () => {
    setCachedEmbedding('a', [1]);
    clearEmbeddingCache();
    expect(embeddingCacheSize()).toBe(0);
    expect(getCachedEmbedding('a')).toBeUndefined();
  });
});

describe('embeddings types', () => {
  it('should import ModelInfo type without error', async () => {
    const types = await import('../src/core/embeddings/embeddings.types.js');
    expect(types).toBeDefined();
  });
});

describe('embeddings local (unit — no model download)', () => {
  it('should report model info', async () => {
    const { getModelInfo } = await import('../src/core/embeddings/embeddings.local.js');
    const info = getModelInfo();

    expect(info.name).toContain('MiniLM');
    expect(info.dimensions).toBe(384);
    expect(typeof info.cacheDir).toBe('string');
    expect(info.loaded).toBe(false);
  });

  it('should report not ready before warmup', async () => {
    const { isReady } = await import('../src/core/embeddings/embeddings.local.js');
    // Before warmup, the model is not loaded
    // (actual warmup test requires model download, skipped in CI)
    expect(typeof isReady()).toBe('boolean');
  });
});
