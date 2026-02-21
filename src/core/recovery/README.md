# Recovery System

Inspired by AIOS Epic 5 (Recovery System).

## Overview

The Recovery System provides automatic retry with progressive strategies:

1. **Attempt 1**: Direct retry (same approach)
2. **Attempt 2**: Alternative approach (e.g., skip vector indexing)
3. **Attempt 3**: Additional context (e.g., load related gotchas)
4. **After 3 attempts**: Auto-escalate to human

## Usage

### Basic Tracking

```typescript
import { RecoveryTracker } from './recovery/tracker.js';

const tracker = new RecoveryTracker();

async function performTask(taskId: string) {
  let attempts = 0;
  
  while (attempts < 3) {
    try {
      // Perform operation
      const result = await riskyOperation();
      
      // Clear attempts on success
      await tracker.clearAttempts(taskId);
      return result;
      
    } catch (error) {
      const recovery = await tracker.trackAttempt(taskId, error, { taskId });
      
      if (!recovery.retry) {
        // Escalated - throw to human
        throw new Error(`Task ${taskId} failed after 3 attempts`);
      }
      
      console.log(`Retrying with strategy: ${recovery.strategy}`);
      attempts++;
    }
  }
}
```

### With Checkpoint Recording

```typescript
import { RecoveryTracker } from './recovery/tracker.js';
import { applyCheckpointRetryStrategy, getRetryOptions } from './recovery/strategies.js';
import { recordCheckpoint } from './checkpoint.js';

async function recordCheckpointWithRetry(data: RunCheckpoint) {
  const tracker = new RecoveryTracker();
  const taskId = data.run_id || 'checkpoint';
  
  let attempts = 0;
  
  while (attempts < 3) {
    try {
      const strategy = attempts === 0 ? 'direct-retry' 
        : attempts === 1 ? 'alternative-approach'
        : 'additional-context';
      
      const result = await applyCheckpointRetryStrategy(
        async (options) => {
          // Custom logic based on retry options
          if (options.skipVectorIndex) {
            // Record without vector indexing
            return recordCheckpoint(data, undefined, undefined);
          }
          
          return recordCheckpoint(data);
        },
        strategy
      );
      
      await tracker.clearAttempts(taskId);
      return result;
      
    } catch (error) {
      const recovery = await tracker.trackAttempt(taskId, error, data);
      
      if (!recovery.retry) {
        throw error; // Escalate
      }
      
      attempts++;
    }
  }
}
```

### Monitoring Escalations

```typescript
const tracker = new RecoveryTracker();

// Get recent escalations
const escalations = await tracker.getRecentEscalations(10);

console.log('Recent escalations:', escalations);
// [
//   {
//     timestamp: '2026-02-21T03:00:00Z',
//     task_id: 'checkpoint-123',
//     total_attempts: 3,
//     errors: ['Network timeout', 'ECONNREFUSED', 'Lock timeout'],
//     strategies_tried: ['direct-retry', 'alternative-approach', 'additional-context'],
//     last_error: 'Lock timeout'
//   }
// ]
```

### Rollback

```typescript
const tracker = new RecoveryTracker();

// Rollback to last known good state
await tracker.rollback('checkpoint-123');
```

## Retry Strategies

### Direct Retry
- **When**: First attempt
- **Approach**: Retry immediately with same parameters
- **Timeout**: 10s

### Alternative Approach
- **When**: Second attempt
- **Approach**: Skip expensive operations (e.g., vector indexing)
- **Timeout**: 15s

### Additional Context
- **When**: Third attempt
- **Approach**: Load related data (gotchas, recent runs, context)
- **Timeout**: 20s

## Error Classification

### Retryable Errors
- Network timeouts
- Connection refused
- Lock timeouts
- Temporary failures

### Critical Errors (Immediate Escalation)
- Validation failures
- Schema errors
- Integrity constraints
- Unique constraint violations

## File Structure

```
recovery/
├── attempts/
│   ├── task-123.json          # Attempt records per task
│   └── checkpoint-456.json
├── archive/
│   └── task-123.json          # Archived after success
└── escalations.jsonl          # Append-only escalation log
```

## Configuration

Adjust max attempts in `tracker.ts`:

```typescript
private readonly maxAttempts = 3; // Change to 5 for more retries
```

## Integration Points

### With CheckpointValidator
Recovery system complements validation:
- Validator catches data issues (non-retryable)
- Tracker handles transient failures (retryable)

### With Mother Brain Memory
On escalation, create a gotcha:

```typescript
if (!recovery.retry) {
  await upsertNode({
    type: 'gotcha',
    title: `Task ${taskId} failed after 3 attempts`,
    severity: 'high',
    solution: 'Review error logs and fix root cause',
    refs: { runs: [taskId] }
  });
}
```

## Best Practices

1. **Clear attempts on success** - Always call `clearAttempts()` after successful completion
2. **Log strategies** - Track which strategy succeeded for future optimization
3. **Monitor escalations** - Review `escalations.jsonl` regularly
4. **Implement rollback** - Define what "last good state" means per operation type
5. **Categorize errors** - Use `isRetryableError()` and `isCriticalError()` helpers

## Future Enhancements

- [ ] Exponential backoff between retries
- [ ] Configurable retry strategies per operation type
- [ ] Integration with monitoring/alerting systems
- [ ] Automatic gotcha creation on repeated failures
- [ ] Circuit breaker pattern for cascading failures
