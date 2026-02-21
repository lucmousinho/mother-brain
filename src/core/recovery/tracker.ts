import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getStorageDir } from '../../utils/paths.js';

export interface AttemptRecord {
  timestamp: number;
  error: string;
  stack?: string;
  context: Record<string, unknown>;
  attempt_number: number;
  strategy?: string;
}

export interface RecoveryResult {
  retry: boolean;
  strategy?: string;
  escalate?: boolean;
}

/**
 * RecoveryTracker - Inspired by AIOS Epic 5 (Recovery System)
 *
 * Tracks failed attempts and implements retry strategies:
 * - Attempt 1: Direct retry
 * - Attempt 2: Retry with alternative strategy
 * - Attempt 3: Retry with additional context
 * - After 3: Auto-escalate to human
 */
export class RecoveryTracker {
  private readonly recoveryDir: string;
  private readonly maxAttempts = 3;

  constructor() {
    this.recoveryDir = join(getStorageDir(), 'recovery');
    mkdirSync(this.recoveryDir, { recursive: true });
  }

  /**
   * Track a failed attempt and decide on retry strategy.
   */
  async trackAttempt(
    taskId: string,
    error: Error,
    context: Record<string, unknown>,
  ): Promise<RecoveryResult> {
    const attempts = await this.loadAttempts(taskId);

    const attemptRecord: AttemptRecord = {
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack,
      context,
      attempt_number: attempts.length + 1,
    };

    attempts.push(attemptRecord);
    await this.saveAttempts(taskId, attempts);

    // Check if should escalate
    if (attempts.length >= this.maxAttempts) {
      console.error(
        `[recovery] Task ${taskId} failed ${attempts.length} times. Escalating to human.`,
      );

      // Log escalation
      await this.logEscalation(taskId, attempts);

      return {
        retry: false,
        escalate: true,
      };
    }

    // Determine retry strategy based on attempt number
    const strategy = this.getRetryStrategy(attempts.length);
    attemptRecord.strategy = strategy;

    console.warn(
      `[recovery] Task ${taskId} failed (attempt ${attempts.length}/${this.maxAttempts}). Retry with strategy: ${strategy}`,
    );

    return {
      retry: true,
      strategy,
    };
  }

  /**
   * Load attempts for a task.
   */
  private async loadAttempts(taskId: string): Promise<AttemptRecord[]> {
    const filePath = this.getAttemptsPath(taskId);

    if (!existsSync(filePath)) {
      return [];
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as AttemptRecord[];
    } catch {
      return [];
    }
  }

  /**
   * Save attempts for a task.
   */
  private async saveAttempts(taskId: string, attempts: AttemptRecord[]): Promise<void> {
    const filePath = this.getAttemptsPath(taskId);
    writeFileSync(filePath, JSON.stringify(attempts, null, 2), 'utf-8');
  }

  /**
   * Determine retry strategy based on attempt number.
   *
   * Strategy evolution:
   * - Attempt 1: Direct retry (same approach)
   * - Attempt 2: Alternative approach (e.g., different embedding model, skip vector)
   * - Attempt 3: Additional context (e.g., load more related data, consult gotchas)
   */
  private getRetryStrategy(attemptNumber: number): string {
    switch (attemptNumber) {
      case 1:
        return 'direct-retry';
      case 2:
        return 'alternative-approach';
      case 3:
        return 'additional-context';
      default:
        return 'escalate';
    }
  }

  /**
   * Log escalation to human.
   */
  private async logEscalation(taskId: string, attempts: AttemptRecord[]): Promise<void> {
    const escalationPath = join(this.recoveryDir, 'escalations.jsonl');

    const escalation = {
      timestamp: new Date().toISOString(),
      task_id: taskId,
      total_attempts: attempts.length,
      errors: attempts.map((a) => a.error),
      strategies_tried: attempts.map((a) => a.strategy).filter(Boolean),
      last_error: attempts[attempts.length - 1]?.error,
      last_stack: attempts[attempts.length - 1]?.stack,
    };

    const line = JSON.stringify(escalation) + '\n';

    try {
      const existing = existsSync(escalationPath) ? readFileSync(escalationPath, 'utf-8') : '';
      writeFileSync(escalationPath, existing + line, 'utf-8');
    } catch (err) {
      console.error('[recovery] Failed to log escalation:', err);
    }
  }

  /**
   * Clear attempts for a task (called after successful completion).
   */
  async clearAttempts(taskId: string): Promise<void> {
    const filePath = this.getAttemptsPath(taskId);

    if (existsSync(filePath)) {
      try {
        // Instead of deleting, move to archive
        const archivePath = filePath.replace('/recovery/', '/recovery/archive/');
        mkdirSync(join(this.recoveryDir, 'archive'), { recursive: true });

        const content = readFileSync(filePath, 'utf-8');
        writeFileSync(archivePath, content, 'utf-8');

        // Then delete original
        await import('node:fs/promises').then((fs) => fs.unlink(filePath));

        console.log(`[recovery] Cleared attempts for task ${taskId} (archived)`);
      } catch {
        // Silent fail - not critical
      }
    }
  }

  /**
   * Get attempts file path for a task.
   */
  private getAttemptsPath(taskId: string): string {
    const sanitizedId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.recoveryDir, `${sanitizedId}.json`);
  }

  /**
   * Rollback to last known good state (placeholder).
   * Actual implementation depends on what "good state" means for each operation.
   */
  async rollback(taskId: string): Promise<void> {
    console.warn(
      `[recovery] Rollback requested for task ${taskId}. Implement rollback logic based on operation type.`,
    );

    // For checkpoints: could delete last checkpoint file
    // For nodes: could restore from previous version
    // For vectors: could remove last indexed doc

    // Clear attempts after rollback
    await this.clearAttempts(taskId);
  }

  /**
   * Get recent escalations (for monitoring).
   */
  async getRecentEscalations(limit: number = 10): Promise<unknown[]> {
    const escalationPath = join(this.recoveryDir, 'escalations.jsonl');

    if (!existsSync(escalationPath)) {
      return [];
    }

    try {
      const content = readFileSync(escalationPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      return lines
        .slice(-limit)
        .map((line) => JSON.parse(line))
        .reverse();
    } catch {
      return [];
    }
  }
}
