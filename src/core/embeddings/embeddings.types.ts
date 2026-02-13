export interface EmbeddingResult {
  text: string;
  vector: number[];
  model: string;
  cached: boolean;
}

export interface ModelInfo {
  name: string;
  dimensions: number;
  cacheDir: string;
  loaded: boolean;
}

export interface EmbeddingProvider {
  embedText(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  isReady(): boolean;
  warmup(): Promise<void>;
  getModelInfo(): ModelInfo;
}
