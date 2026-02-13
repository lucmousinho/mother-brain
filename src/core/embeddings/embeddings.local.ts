import { resolve } from 'node:path';
import type { EmbeddingProvider, ModelInfo } from './embeddings.types.js';
import { getCachedEmbedding, setCachedEmbedding } from './embeddings.cache.js';
import { getStorageDir } from '../../utils/paths.js';

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
const DIMENSIONS = 384;
const TIMEOUT_MS = 30_000;

// Pipeline reference (lazy-loaded)
let extractorInstance: PipelineInstance | null = null;
let loadedModel = '';

/** Internal type for the Xenova pipeline — avoids depending on package types at compile time. */
interface PipelineInstance {
  (text: string, options: { pooling: string; normalize: boolean }): Promise<{ data: Float32Array }>;
}

function getModelName(): string {
  return process.env.MB_EMBEDDING_MODEL || DEFAULT_MODEL;
}

function getCacheDir(): string {
  if (process.env.MB_MODEL_CACHE_DIR) {
    return resolve(process.env.MB_MODEL_CACHE_DIR);
  }
  return resolve(getStorageDir(), 'models');
}

async function loadPipeline(): Promise<PipelineInstance> {
  if (extractorInstance && loadedModel === getModelName()) {
    return extractorInstance;
  }

  // Dynamic import — only loaded when actually needed
  const { pipeline } = await import('@xenova/transformers');
  const model = getModelName();
  const cacheDir = getCacheDir();

  extractorInstance = (await pipeline('feature-extraction', model, {
    cache_dir: cacheDir,
  })) as unknown as PipelineInstance;
  loadedModel = model;

  return extractorInstance;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Embedding timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function embedTextRaw(text: string): Promise<number[]> {
  const extractor = await loadPipeline();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// ── Public API ──────────────────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  const cached = getCachedEmbedding(text);
  if (cached) return cached;

  const vector = await withTimeout(embedTextRaw(text), TIMEOUT_MS);
  setCachedEmbedding(text, vector);
  return vector;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await embedText(text));
  }
  return results;
}

export function isReady(): boolean {
  return extractorInstance !== null && loadedModel === getModelName();
}

export async function warmup(): Promise<void> {
  await loadPipeline();
  // Run a test embedding to fully warm the ONNX session
  await embedText('warmup');
}

export function getModelInfo(): ModelInfo {
  return {
    name: getModelName(),
    dimensions: DIMENSIONS,
    cacheDir: getCacheDir(),
    loaded: isReady(),
  };
}

/** Bundle the module as an EmbeddingProvider interface. */
export const localProvider: EmbeddingProvider = {
  embedText,
  embedBatch,
  isReady,
  warmup,
  getModelInfo,
};
