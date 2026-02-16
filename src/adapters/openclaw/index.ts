/**
 * OpenClaw adapter — public entry point.
 *
 * Usage:
 *   import { OpenClawHooks } from 'mother-brain/openclaw';
 *
 * Quick start (reads config from env vars):
 *   const hooks = OpenClawHooks.fromEnv();
 *
 * See docs/openclaw-integration.md for full setup instructions.
 */
export { OpenClawHooks } from './hooks.js';
export { openClawToCheckpoint } from './adapter.js';
export type {
  OpenClawEvent,
  OpenClawTask,
  OpenClawCommand,
  OpenClawAdapterConfig,
} from './types.js';

// Re-export the client SDK for advanced use cases where OpenClaw needs
// to call Mother Brain endpoints directly beyond the standard hooks.
export { MotherBrainClient, MotherBrainApiError } from '../../client/client.js';
export type { MotherBrainClientConfig, UnavailablePolicy } from '../../client/types.js';
