import { createHash } from 'node:crypto';

const cache = new Map<string, number[]>();

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function getCachedEmbedding(text: string): number[] | undefined {
  return cache.get(hashText(text));
}

export function setCachedEmbedding(text: string, vector: number[]): void {
  cache.set(hashText(text), vector);
}

export function clearEmbeddingCache(): void {
  cache.clear();
}

export function embeddingCacheSize(): number {
  return cache.size;
}
