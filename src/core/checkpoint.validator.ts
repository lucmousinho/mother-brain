import type { RunCheckpoint } from './schemas.js';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * CheckpointValidator provides self-critique for run checkpoints.
 * Inspired by AIOS ADE Epic 4 (Execution Engine) self-critique steps.
 *
 * Validates:
 * - Schema completeness
 * - Data integrity
 * - Quality of summary/goal
 * - Context linkage
 */
export class CheckpointValidator {
  /**
   * Validate a checkpoint before persistence.
   * Returns structured errors (blocking) and warnings (non-blocking).
   */
  validate(checkpoint: RunCheckpoint): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // 1. Required fields validation
    if (!checkpoint.agent?.id) {
      errors.push({
        field: 'agent.id',
        message: 'Agent ID is required',
        severity: 'error',
      });
    }

    if (!checkpoint.agent?.name) {
      errors.push({
        field: 'agent.name',
        message: 'Agent name is required',
        severity: 'error',
      });
    }

    if (!checkpoint.intent?.goal) {
      errors.push({
        field: 'intent.goal',
        message: 'Goal is required',
        severity: 'error',
      });
    }

    if (!checkpoint.result?.status) {
      errors.push({
        field: 'result.status',
        message: 'Result status is required',
        severity: 'error',
      });
    }

    // 2. Data integrity validation
    if (checkpoint.result?.status === 'success' && !checkpoint.result.output) {
      errors.push({
        field: 'result.output',
        message: 'Success status requires output',
        severity: 'error',
      });
    }

    if (checkpoint.result?.status === 'error' && !checkpoint.result.error) {
      warnings.push({
        field: 'result.error',
        message: 'Error status should include error details',
        severity: 'warning',
      });
    }

    // 3. Context linkage validation
    if (!checkpoint.context_id) {
      warnings.push({
        field: 'context_id',
        message: 'Missing context_id - checkpoint will default to __global__',
        severity: 'warning',
      });
    }

    // 4. Quality validation (self-critique)
    if (checkpoint.intent?.summary) {
      const summaryLength = checkpoint.intent.summary.length;

      if (summaryLength < 20) {
        warnings.push({
          field: 'intent.summary',
          message: `Summary too short (${summaryLength} chars, minimum 20)`,
          severity: 'warning',
        });
      }

      if (summaryLength > 500) {
        warnings.push({
          field: 'intent.summary',
          message: `Summary too long (${summaryLength} chars, maximum 500 recommended)`,
          severity: 'warning',
        });
      }
    } else {
      warnings.push({
        field: 'intent.summary',
        message: 'Missing summary - makes recall less effective',
        severity: 'warning',
      });
    }

    if (checkpoint.intent?.goal) {
      const goalLength = checkpoint.intent.goal.length;

      if (goalLength < 10) {
        warnings.push({
          field: 'intent.goal',
          message: `Goal too vague (${goalLength} chars, minimum 10)`,
          severity: 'warning',
        });
      }
    }

    // 5. Tags validation
    if (!checkpoint.tags || checkpoint.tags.length === 0) {
      warnings.push({
        field: 'tags',
        message: 'No tags - makes categorization and recall harder',
        severity: 'warning',
      });
    }

    if (checkpoint.tags && checkpoint.tags.length > 20) {
      warnings.push({
        field: 'tags',
        message: `Too many tags (${checkpoint.tags.length}, recommended max 10)`,
        severity: 'warning',
      });
    }

    // 6. Risk flags validation
    if (checkpoint.risk_flags && checkpoint.risk_flags.length > 0) {
      warnings.push({
        field: 'risk_flags',
        message: `Risk flags present: ${checkpoint.risk_flags.join(', ')}`,
        severity: 'warning',
      });
    }

    // 7. Files touched validation
    if (checkpoint.files_touched && checkpoint.files_touched.length > 50) {
      warnings.push({
        field: 'files_touched',
        message: `Many files touched (${checkpoint.files_touched.length}) - consider breaking into smaller runs`,
        severity: 'warning',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Format validation result for logging/display.
   */
  formatResult(result: ValidationResult): string {
    const lines: string[] = [];

    if (result.valid) {
      lines.push('✅ Checkpoint validation passed');
    } else {
      lines.push('❌ Checkpoint validation failed');
    }

    if (result.errors.length > 0) {
      lines.push('\nErrors:');
      for (const err of result.errors) {
        lines.push(`  - ${err.field}: ${err.message}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push('\nWarnings:');
      for (const warn of result.warnings) {
        lines.push(`  ⚠️  ${warn.field}: ${warn.message}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Validate and throw if invalid.
   * Useful for strict validation mode.
   */
  validateOrThrow(checkpoint: RunCheckpoint): void {
    const result = this.validate(checkpoint);

    if (!result.valid) {
      throw new Error(
        `Checkpoint validation failed:\n${this.formatResult(result)}`
      );
    }

    // Log warnings even if valid
    if (result.warnings.length > 0) {
      console.warn(this.formatResult(result));
    }
  }
}
