/**
 * Recovery Strategies - Inspired by AIOS Epic 5
 *
 * Different retry strategies for different failure scenarios.
 */

export type RetryStrategy =
  | 'direct-retry'
  | 'alternative-approach'
  | 'additional-context'
  | 'escalate';

export interface RetryOptions {
  strategy: RetryStrategy;
  skipVectorIndex?: boolean;
  useAlternativeEmbedding?: boolean;
  loadAdditionalContext?: boolean;
  timeout?: number;
}

/**
 * Get retry options based on strategy.
 */
export function getRetryOptions(strategy: RetryStrategy): RetryOptions {
  switch (strategy) {
    case 'direct-retry':
      // Attempt 1: Just retry with same approach
      return {
        strategy,
        timeout: 10000, // 10s timeout
      };

    case 'alternative-approach':
      // Attempt 2: Try alternative methods
      return {
        strategy,
        skipVectorIndex: true, // Skip embedding if that's failing
        timeout: 15000, // 15s timeout
      };

    case 'additional-context':
      // Attempt 3: Load more context before retrying
      return {
        strategy,
        loadAdditionalContext: true,
        useAlternativeEmbedding: true,
        timeout: 20000, // 20s timeout
      };

    case 'escalate':
    default:
      // No more retries
      return {
        strategy: 'escalate',
      };
  }
}

/**
 * Apply retry strategy to checkpoint recording.
 */
export async function applyCheckpointRetryStrategy<T>(
  operation: (options: RetryOptions) => Promise<T>,
  strategy: RetryStrategy,
): Promise<T> {
  const options = getRetryOptions(strategy);

  // Apply strategy-specific modifications
  if (options.skipVectorIndex) {
    console.log('[recovery] Skipping vector indexing (alternative approach)');
  }

  if (options.useAlternativeEmbedding) {
    console.log('[recovery] Using alternative embedding model (additional context)');
  }

  if (options.loadAdditionalContext) {
    console.log('[recovery] Loading additional context (additional context)');
    // Could load related gotchas, recent runs, etc.
  }

  // Execute operation with timeout
  if (options.timeout) {
    return Promise.race([
      operation(options),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), options.timeout),
      ),
    ]);
  }

  return operation(options);
}

/**
 * Determine if an error is retryable.
 */
export function isRetryableError(error: Error): boolean {
  const retryablePatterns = [
    /timeout/i,
    /network/i,
    /connection/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /lock/i,
  ];

  return retryablePatterns.some((pattern) => pattern.test(error.message));
}

/**
 * Determine if an error should trigger immediate escalation.
 */
export function isCriticalError(error: Error): boolean {
  const criticalPatterns = [
    /validation failed/i,
    /schema error/i,
    /integrity constraint/i,
    /unique constraint/i,
    /foreign key/i,
  ];

  return criticalPatterns.some((pattern) => pattern.test(error.message));
}
