# OpenClaw Integration

Use Mother Brain as OpenClaw's memory backbone with safe fallback.

## What this integration gives you

The OpenClaw adapter exposes 4 lifecycle hooks:

- `beforeAction(task)` → runs `recall` before the agent acts
- `checkPolicy(command)` → checks command/path/host against policy rules
- `afterAction(event)` → records a run checkpoint after execution
- `healthCheck()` → cached `/health` probe for heartbeat/cron safety

If Mother Brain is unavailable, behavior is controlled by `onUnavailable`:

- `skip` (default): return `null`, do not block OpenClaw
- `warn`: same as skip + warning log
- `throw`: fail fast (only for strict environments)

## Quick wiring in OpenClaw

```ts
import { OpenClawHooks } from 'mother-brain/openclaw';

const hooks = OpenClawHooks.fromEnv();

// before each action
const memory = await hooks.beforeAction({
  description: taskDescription,
  tags: taskTags,
  limit: 5,
});

// before command execution
const policy = await hooks.checkPolicy({ cmd: command, path, host });
if (policy && !policy.allowed) {
  throw new Error(`Blocked by policy: ${policy.reason}`);
}

// after action completion
await hooks.afterAction(openClawEvent);
```

## Environment variables

Both prefixes are supported (`MOTHERBRAIN_*` preferred, `MB_*` kept for compatibility):

- `MOTHERBRAIN_API_URL` (`MB_URL`) default: `http://127.0.0.1:7337`
- `MOTHERBRAIN_TOKEN` (`MB_TOKEN`)
- `MOTHERBRAIN_TIMEOUT_MS` (`MB_TIMEOUT_MS`) default: `5000`
- `MOTHERBRAIN_HEALTH_CACHE_MS` (`MB_HEALTH_CACHE_MS`) default: `30000`
- `MOTHERBRAIN_ON_UNAVAILABLE` (`MB_ON_UNAVAILABLE`) `skip|warn|throw` (default `skip`)
- `MOTHERBRAIN_AGENT_ID` (`MB_AGENT_ID`) default: `openclaw`
- `MOTHERBRAIN_AGENT_NAME` (`MB_AGENT_NAME`) default: `OpenClaw Agent`
- `MOTHERBRAIN_CONTEXT_ID` (`MB_CONTEXT_ID`) optional scoped-memory context

## Rollout (recommended)

1. **Record only**: call only `afterAction`.
2. **Advisory recall**: call `beforeAction`, log/use context softly.
3. **Policy enforcement**: enforce `checkPolicy` blocks.
4. Keep `MOTHERBRAIN_ON_UNAVAILABLE=skip` until stable.

Kill switch: `MOTHERBRAIN_ENABLED=false` at the OpenClaw side (do not instantiate hooks).

## Downtime fallback behavior

- All API calls use timeout.
- Health is cached (default 30s) to avoid repeated slow failures.
- With `skip|warn`, OpenClaw continues with its native local memory flow.
- When Mother Brain comes back, calls resume automatically.
