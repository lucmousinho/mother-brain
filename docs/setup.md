# Setup

One command initializes everything:

```bash
motherbrain setup
```

This runs four phases automatically:

1. **Init** — creates folder structure, default policies, and storage
2. **Configure `.env`** — copies `.env.example` to `.env` with optional overrides
3. **Enable repo mode** — detects git, creates `VERSION` file
4. **Validate** — checks all required paths exist and prints OK/MISSING

The command is idempotent — safe to run multiple times. It skips phases that are already done.

## Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--with-token` | `-t` | Generate a random `MB_TOKEN` in `.env` |
| `--port <number>` | `-p` | Set `MB_API_PORT` (default 7337) |
| `--force` | `-f` | Overwrite existing `.env` |

## Examples

```bash
# Basic setup (no auth token)
motherbrain setup

# Setup with a generated auth token
motherbrain setup --with-token

# Setup with a custom port and auth token
motherbrain setup --with-token --port 8080

# Re-run setup and overwrite .env
motherbrain setup --with-token --force
```

## After setup

```bash
# Start the local API
motherbrain api start

# Verify it's running
curl http://127.0.0.1:7337/health
```

---

## Connect Your AI Agent

To connect an AI agent (OpenClaw or any other) to Mother Brain, point the agent at the skill file:

```
Read https://raw.githubusercontent.com/lucmousinho/mother-brain/main/docs/skill.md and follow the instructions.
```

The skill file contains the full API reference, authentication details, request/response schemas, and the 4-step execution cycle that every agent must follow.

### Quick Overview

Mother Brain is designed to complement OpenClaw's memory architecture. Every agent action follows this cycle:

```
Agent
  |
  +-- 1. GET /recall?q="current task"     -> context + constraints
  +-- 2. POST /policy/check               -> allow/deny
  +-- 3. [execute action]
  +-- 4. POST /runs                        -> persist checkpoint
```

1. **Before acting**: Call `recall` to get relevant context, constraints, and suggested actions.
2. **Before executing**: Call `policy-check` for each command/path/host to enforce security.
3. **Execute**: Perform the action (only if policy allows it).
4. **After acting**: Call `record` to persist the run checkpoint.

See `src/adapters/openclaw/hooks.ts` and `src/adapters/openclaw/adapter.ts` for the OpenClaw lifecycle integration and event mapping. See [OpenClaw Integration](./openclaw-integration.md) for plug-and-play setup and [Agent Skill](./skill.md) for the complete integration guide.
