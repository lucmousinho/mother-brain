/**
 * LanceDB table name and seed record schema.
 *
 * LanceDB infers the Arrow schema from the first batch of records,
 * so we provide a typed seed factory to guarantee column names and types.
 */

import type { VectorDoc } from './vector.types.js';

export const TABLE_NAME = 'knowledge';

/** Dimensions for the default model (all-MiniLM-L6-v2). */
export const DEFAULT_DIMENSIONS = 384;

/** Returns a zero-filled seed record used only when the table doesn't exist yet. */
export function seedRecord(dimensions: number = DEFAULT_DIMENSIONS): VectorDoc {
  return {
    id: '__seed__',
    kind: 'node',
    ref_id: '__seed__',
    vector: new Array<number>(dimensions).fill(0),
    text: '',
    tags_json: '[]',
    type: '',
    status: '',
    updated_at: new Date().toISOString(),
    context_id: '__global__',
    scope_path: '__global__',
  };
}
