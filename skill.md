---
name: motherbrain
description: End-to-end automatic Mother Brain integration for OpenClaw (install, hook wiring, health checks, and auto-usage).
version: 0.2.0
homepage: https://github.com/lucmousinho/mother-brain
metadata:
  integration_mode: auto
  api_base: http://127.0.0.1:7337
  auth_header: X-MB-TOKEN
  cli_binary: motherbrain
  port: 7337
---

# Mother Brain — OpenClaw Auto-Integration Skill

Use this skill when the user asks to integrate Mother Brain with OpenClaw automatically.

## Objective

When this file is read by an OpenClaw agent, the agent must:

1. Install Mother Brain if missing
2. Initialize Mother Brain structure
3. Ensure API is running
4. Wire OpenClaw hooks for:
   - automatic command checkpoint recording
   - pre-action recall enrichment
5. Validate end-to-end integration
6. Leave the system active and usable immediately

The workflow must be idempotent (safe to run more than once).

---

## Integration Contract (Must Follow)

- Prefer non-interactive commands.
- Do not block user reply if Mother Brain is temporarily unavailable.
- Keep hooks fail-safe (`try/catch`, short timeout).
- Preserve existing OpenClaw hooks and append Mother Brain handlers if absent.
- Never duplicate handlers in config.

---

## Step 0 — Resolve workspace and paths

Use OpenClaw workspace when available; default to:

- Workspace: `/home/lucas/.openclaw/workspace`
- OpenClaw config: `~/.openclaw/openclaw.json`
- Hooks dir: `<workspace>/hooks`
- Memory dir: `<workspace>/memory`
- Env file: `<workspace>/.env`

Required files to create/update:

- `<workspace>/hooks/mb-command-checkpoint.mjs`
- `<workspace>/hooks/mb-preaction-enrich.mjs`
- `<workspace>/hooks/mb-sector-router.mjs`
- `<workspace>/hooks/mb-preaction-allowlist.json`

---

## Step 1 — Install Mother Brain (if missing)

Check:

```bash
command -v motherbrain >/dev/null 2>&1
```

If missing, install:

```bash
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash
```

Then confirm:

```bash
motherbrain --version
```

---

## Step 2 — Initialize and run API

Run idempotent setup:

```bash
motherbrain setup || motherbrain init
motherbrain api start
```

Health check:

```bash
curl -s http://127.0.0.1:7337/health
```

Expected contains: `"status":"ok"`

If token auth is enabled, read `MB_TOKEN` from `<workspace>/.env` and pass:

```bash
curl -s -H "X-MB-TOKEN: $MB_TOKEN" http://127.0.0.1:7337/health
```

---

## Step 3 — Create hook files (Level 3)

### 3.1 `mb-command-checkpoint.mjs`

Create/update a hook that listens to `event.type === "command"` and:

- optionally recalls context from `/recall` (short timeout)
- posts checkpoint to `/runs`
- writes compact context cache in `<workspace>/memory/mb-last-context.json`
- appends one line to `<workspace>/memory/YYYY-MM-DD.md`
- never throws (silent fallback)

### 3.2 `mb-preaction-enrich.mjs`

Create/update a hook that listens to `event.type === "command"` and enriches before critical or allowlisted actions:

- classify critical commands (config/update/restart/install/remove/delete/deploy/reset etc.)
- read custom allowlist file `mb-preaction-allowlist.json`
- modes:
  - `allowlist-plus-critical`
  - `allowlist-only`
- call `/recall` with short timeout
- persist compact context to `<workspace>/memory/mb-preaction-context.json`
- append one line to `<workspace>/memory/YYYY-MM-DD.md`
- optionally push concise context text to `event.messages`
- never throws (silent fallback)

### 3.3 `mb-preaction-allowlist.json`

Create if missing:

```json
{
  "enabled": true,
  "mode": "allowlist-plus-critical",
  "commands": [
    "config.patch",
    "config.apply",
    "update.run",
    "gateway.restart",
    "gateway.stop",
    "cron.add",
    "cron.update",
    "cron.remove",
    "message.send",
    "sessions_send",
    "exec"
  ],
  "patterns": [
    "deploy",
    "migration",
    "backup",
    "payment",
    "invoice",
    "customer-data"
  ]
}
```

### 3.4 `mb-sector-router.mjs`

Create/update a hook that classifies commands into domain sectors and records sector-scoped memory traces.

Template source in this repository:

- `templates/hooks/mb-sector-router.mjs`

Runtime behavior:

- detect sector from `memory/sector-router.json`
- run recall with sector-aware query
- write cache to `memory/mb-sector-context.json`
- append summary to `memory/sectors/<sector>.md`
- record run with tags like:
  - `sector:marketing`
  - `role:software-engineer-fullstack`
- never block command execution on failures

---

## Step 4 — Wire OpenClaw hooks config

Ensure OpenClaw config includes:

- `hooks.internal.enabled = true`
- `hooks.internal.load.extraDirs` contains `<workspace>/hooks`
- `hooks.internal.handlers` contains:
  - `{ "event": "command", "module": "mb-command-checkpoint.mjs" }`
  - `{ "event": "command", "module": "mb-preaction-enrich.mjs" }`
  - `{ "event": "command", "module": "mb-sector-router.mjs" }`

Important:

- Keep existing handlers.
- Add missing only (no duplicates).

If `gateway` tool is available, use `config.patch`.
Otherwise patch `~/.openclaw/openclaw.json` and restart gateway:

```bash
openclaw gateway restart
```

---

## Step 5 — Validation checklist

Run all checks and report pass/fail:

1. `motherbrain --version`
2. `curl /health` returns `ok`
3. Hook files exist in `<workspace>/hooks`
4. OpenClaw config has both MB handlers
5. Trigger a safe command event and verify no runtime error
6. Confirm cache files can be written under `<workspace>/memory`

Optional functional check:

- Verify a new run appears from command hook after one command.

---

## Step 6 — Completion message format

Return concise summary including:

- what was installed/updated
- paths of created files
- whether gateway restart happened
- validation results
- current mode from allowlist (`allowlist-plus-critical` or `allowlist-only`)

If any step failed, provide exact failing command and a one-line fix.

---

## Step 7 — Sector-based memory routing (by user intent)

Add and use domain memory sectors so the agent recalls and records context by type of work.

### 7.1 Sector mapping

Use this default routing table (extendable):

- Marketing / content / social / campaign / Instagram / ad copy
  - sector: `marketing`
  - role tag: `marketing`
- Software / coding / refactor / bugfix / architecture / API / frontend / backend
  - sector: `engineering-fullstack`
  - role tag: `software-engineer-fullstack`
- Sales / CRM / outreach / pipeline
  - sector: `sales`
  - role tag: `sales`
- Finance / budget / invoice / cost / pricing
  - sector: `finance`
  - role tag: `finance`
- Operations / SOP / process / automation runbooks
  - sector: `operations`
  - role tag: `operations`
- Fallback for unknown tasks
  - sector: `general`
  - role tag: `generalist`

### 7.2 Files to persist in workspace

Create if missing:

- `<workspace>/memory/sectors/marketing.md`
- `<workspace>/memory/sectors/engineering-fullstack.md`
- `<workspace>/memory/sectors/sales.md`
- `<workspace>/memory/sectors/finance.md`
- `<workspace>/memory/sectors/operations.md`
- `<workspace>/memory/sectors/general.md`
- `<workspace>/memory/sector-router.json`

Default router file:

```json
{
  "defaultSector": "general",
  "routes": [
    { "matchAny": ["instagram", "postagem", "campanha", "marketing", "social"], "sector": "marketing", "roleTag": "marketing" },
    { "matchAny": ["software", "código", "api", "frontend", "backend", "refactor", "bug"], "sector": "engineering-fullstack", "roleTag": "software-engineer-fullstack" },
    { "matchAny": ["vendas", "crm", "pipeline", "lead", "outreach"], "sector": "sales", "roleTag": "sales" },
    { "matchAny": ["financeiro", "invoice", "fatura", "custo", "budget", "pricing"], "sector": "finance", "roleTag": "finance" },
    { "matchAny": ["operações", "sop", "processo", "runbook", "automação"], "sector": "operations", "roleTag": "operations" }
  ]
}
```

### 7.3 Runtime behavior (mandatory)

For each user request:

1. Classify sector from user intent (`matchAny`, case-insensitive)
2. Pre-action recall query must include sector context, for example:
   - `"marketing instagram post"`
   - `"engineering-fullstack refactor api"`
3. Record checkpoints with sector tags:
   - `tags` must include: `sector:<name>` and `role:<roleTag>`
4. Append a human-readable log line into the sector file:
   - `<workspace>/memory/sectors/<sector>.md`
5. Keep non-blocking fallback if Mother Brain API is down

### 7.4 Explicit examples

- If user asks: “gerar uma postagem no Instagram”
  - use `sector=marketing`
  - recall from marketing context
  - record run with `tags: ["sector:marketing", "role:marketing"]`
  - append summary to `memory/sectors/marketing.md`

- If user asks: “editar um projeto de software”
  - use `sector=engineering-fullstack`
  - recall from engineering context
  - record run with `tags: ["sector:engineering-fullstack", "role:software-engineer-fullstack"]`
  - append summary to `memory/sectors/engineering-fullstack.md`

---

## Non-Blocking Reliability Rules

Every hook must:

- use short timeouts (`~1.8s` recall, `~2.5s` record)
- swallow network errors
- avoid crashing OpenClaw command flow

If Mother Brain is down, OpenClaw must continue operating normally.

---

## Notes for macOS/Linux

- Shell commands are POSIX-compatible.
- Paths must be absolute when writing hooks and config.
- `~/.openclaw/openclaw.json` location is the same pattern on Linux/macOS.

---

## One-Line Mission for the executing agent

Implement Mother Brain integration end-to-end (install + hook wiring + validation) so the user can immediately use automatic recall/record in OpenClaw without manual follow-up.
