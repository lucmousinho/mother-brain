export type VectorDocKind = 'run' | 'node';

export interface VectorDoc {
  id: string;
  kind: VectorDocKind;
  ref_id: string;
  vector: number[];
  text: string;
  tags_json: string;
  type: string;
  status: string;
  updated_at: string;
  context_id: string;
  scope_path: string;
}

export interface VectorSearchResult {
  id: string;
  kind: VectorDocKind;
  ref_id: string;
  text: string;
  tags_json: string;
  type: string;
  status: string;
  updated_at: string;
  similarity_score: number;
  context_id: string;
  scope_path: string;
}

export interface VectorFilter {
  kind?: VectorDocKind;
  type?: string;
  status?: string;
  context_ids?: string[];
}
