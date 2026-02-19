import { createHash } from 'node:crypto';

const MAX_CACHE_SIZE = parseInt(process.env.MB_EMBEDDING_CACHE_MAX || '5000', 10);
const cache = new Map<string, number[]>();

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function getCachedEmbedding(text: string): number[] | undefined {
  const key = hashText(text);
  const value = cache.get(key);
  if (value !== undefined) {
    // Move to end (most recently used)
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

export function setCachedEmbedding(text: string, vector: number[]): void {
  const key = hashText(text);
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry (first key in insertion order)
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, vector);
}

export function clearEmbeddingCache(): void {
  cache.clear();
}

export function embeddingCacheSize(): number {
  return cache.size;
}
