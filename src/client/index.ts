/**
 * Mother Brain Client SDK — public entry point.
 *
 * Usage:
 *   import { MotherBrainClient } from 'mother-brain/client';
 */
export { MotherBrainClient, MotherBrainApiError } from './client.js';
export type {
  MotherBrainClientConfig,
  UnavailablePolicy,
  RecallOptions,
  RecallResponse,
  RecallRunSummary,
  RecallNodeSummary,
  PolicyCheckRequest,
  PolicyCheckResponse,
  HealthResponse,
  RecordCheckpointPayload,
  RecordCheckpointResponse,
} from './types.js';
