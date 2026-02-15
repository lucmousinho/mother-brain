---
name: motherbrain
version: 0.1.0
description: >
  CLI + local API for agent run checkpoints, knowledge tree, hybrid recall,
  and policy gate. Use Mother Brain to capture, organize, and recall context
  across multiple AI agents — all running offline and locally.
homepage: https://github.com/lucmousinho/mother-brain
metadata:
  api_base: http://127.0.0.1:7337
  auth_header: X-MB-TOKEN
  cli_binary: motherbrain
  port: 7337
---

# Mother Brain — Agent Skill

You are now connected to **Mother Brain**, a local system that provides context management, policy enforcement, and execution logging for AI agents.

## What Mother Brain Does

Mother Brain gives you four capabilities:

1. **Recall** — Before you act, query Mother Brain for relevant context: past runs, knowledge nodes, applicable constraints, and suggested next actions.
2. **Policy Gate** — Before executing a command, accessing a path, or connecting to a host, check if the action is allowed by the project's security policies.
3. **Record** — After you act, persist a checkpoint of everything you did: intent, plan, actions, files touched, artifacts, result, and risk flags.
4. **Knowledge Tree** — Create and update structured knowledge nodes (tasks, decisions, patterns, constraints, playbooks) that persist across sessions.

## Setup

### Prerequisites

Mother Brain must be installed and the API must be running.

```bash
# Install (if not already installed)
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash

# Initialize the project structure (run once per project)
motherbrain init

# Start the local API (must be running for HTTP calls)
motherbrain api start
```

### Verify Connection

```bash
curl -s http://127.0.0.1:7337/health
```

Expected response:

```json
{"status":"ok","version":"v1","timestamp":"2025-01-15T10:00:00.000Z"}
```

If the API is not running, start it with `motherbrain api start`.

### Authentication

If the project uses token authentication, include the header `X-MB-TOKEN` in every request:

```bash
curl -H "X-MB-TOKEN: <token>" http://127.0.0.1:7337/health
```

The token is set via the `MB_TOKEN` environment variable in `.env`. If `MB_TOKEN` is not set, no authentication is required.

---

## Agent Execution Cycle

Every agent action should follow this 4-step cycle:

```
┌─────────────────────────────────────────────┐
│  1. RECALL    → GET  /recall?q=<task>       │
│  2. POLICY    → POST /policy/check          │
│  3. EXECUTE   → (your action)               │
│  4. RECORD    → POST /runs                  │
└─────────────────────────────────────────────┘
```

### Step 1 — Recall Context

Before acting, ask Mother Brain what it knows about your current task.

```bash
curl -s "http://127.0.0.1:7337/recall?q=deploy+staging&limit=5"
```

Query parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `q`       | Yes      | Search query (keywords or natural language) |
| `limit`   | No       | Max results (default: 10) |
| `tags`    | No       | Comma-separated tag filter |
| `types`   | No       | Comma-separated node type filter (task, decision, pattern, constraint, playbook, project, goal, agent) |
| `mode`    | No       | Recall mode: `keyword` (default), `semantic`, or `hybrid` |

Response:

```json
{
  "query": "deploy staging",
  "top_runs": [
    {
      "run_id": "run_01JEXAMPLE",
      "agent": "Coder Agent",
      "goal": "Deploy staging environment",
      "result": "success",
      "timestamp": "2025-01-15T10:10:00Z",
      "tags": ["deploy", "staging"]
    }
  ],
  "top_nodes": [
    {
      "id": "task_deploy_staging_001",
      "type": "task",
      "title": "Deploy staging environment",
      "status": "active",
      "tags": ["deploy", "staging", "infra"]
    }
  ],
  "applicable_constraints": [
    {
      "id": "constraint_no_prod_deploy",
      "title": "No production deploys without approval",
      "body": "..."
    }
  ],
  "suggested_next_actions": [
    "Verify staging health checks after deploy",
    "Run integration tests on staging"
  ]
}
```

**Use the response to:**
- Check `applicable_constraints` before planning your action
- Read `suggested_next_actions` for guidance
- Reference `top_runs` to avoid repeating work
- Link your checkpoint to relevant `top_nodes`
- Use `similarity_score` (when available) to gauge semantic relevance — higher is better (0-1 scale)

**Semantic recall tips:**
- Use `mode=semantic` for natural language queries (e.g. "how did we handle authentication")
- Use `mode=hybrid` for best results — combines keyword precision with semantic understanding
- The response includes `source` field indicating which engine produced results (`keyword`, `vector`, or `hybrid`)
- If the embedding model is not loaded, semantic/hybrid automatically falls back to keyword mode

### Step 2 — Check Policy

Before executing any command, accessing any path, or connecting to any host, verify it is allowed.

```bash
# Check a command
curl -s -X POST http://127.0.0.1:7337/policy/check \
  -H "Content-Type: application/json" \
  -d '{"cmd": "git push origin main"}'

# Check a file path
curl -s -X POST http://127.0.0.1:7337/policy/check \
  -H "Content-Type: application/json" \
  -d '{"path": "./src/auth/module.ts"}'

# Check a host
curl -s -X POST http://127.0.0.1:7337/policy/check \
  -H "Content-Type: application/json" \
  -d '{"host": "api.example.com"}'
```

Request body fields (at least one required):

| Field  | Type   | Description |
|--------|--------|-------------|
| `cmd`  | string | Shell command to validate |
| `path` | string | File or directory path to validate |
| `host` | string | Hostname to validate |

Response (allowed):

```json
{
  "allowed": true,
  "cmd": "git push origin main",
  "reason": "Matched allowlist: git *"
}
```

Response (denied):

```json
{
  "allowed": false,
  "cmd": "rm -rf /",
  "reason": "Matched denylist: rm -rf *"
}
```

**Rules:**
- If `allowed` is `false`, **do NOT execute the action**. Report the denial and stop.
- HTTP status `200` = allowed, `403` = denied.
- Dangerous commands (`rm -rf /`, `curl | bash`, `mkfs`, `dd if=`), sensitive paths (`~/.ssh`, `~/.pgpass`, `~/.aws`), and unknown hosts are denied by default.

### Step 3 — Execute Your Action

Proceed with your action only after recall and policy check. Keep track of:
- Every command you run
- Every file you touch
- Every artifact you produce
- The final result (success, failure, partial)
- Any risk flags

### Step 4 — Record Checkpoint

After completing your action, persist a full checkpoint.

```bash
curl -s -X POST http://127.0.0.1:7337/runs \
  -H "Content-Type: application/json" \
  -d '{
    "version": "v1",
    "agent": {
      "id": "your_agent_id",
      "name": "Your Agent Name",
      "session_id": "current_session_id"
    },
    "intent": {
      "goal": "What you set out to do",
      "context": ["Why you did it", "Related task IDs"]
    },
    "plan": [
      {"step": 1, "description": "First step", "status": "done"},
      {"step": 2, "description": "Second step", "status": "done"}
    ],
    "actions": [
      {
        "type": "command",
        "command": "the command you ran",
        "timestamp": "2025-01-15T10:00:00Z"
      }
    ],
    "files_touched": ["src/file.ts"],
    "artifacts": [
      {"type": "log", "content": "Output summary"}
    ],
    "result": {
      "status": "success",
      "summary": "What happened"
    },
    "constraints_applied": ["constraint_ids_from_recall"],
    "risk_flags": [],
    "links": {
      "nodes": ["related_node_ids_from_recall"]
    },
    "tags": ["relevant", "tags"]
  }'
```

Response:

```json
{
  "run_id": "run_01JEXAMPLE123",
  "path": "motherbrain/checkpoints/v1/2025/01/run_01JEXAMPLE123.json",
  "indexed": true
}
```

**Checkpoint fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Always `"v1"` |
| `agent.id` | Yes | Your agent identifier |
| `agent.name` | Yes | Human-readable agent name |
| `agent.session_id` | No | Current session ID |
| `intent.goal` | Yes | What you intended to do |
| `intent.context` | No | Array of context strings |
| `plan` | Yes | Array of steps with `step`, `description`, `status` |
| `actions` | Yes | Array of actions taken (`type`, `command`, `timestamp`, etc.) |
| `files_touched` | No | Array of file paths affected |
| `artifacts` | No | Array of artifacts (`type`, `path` or `content`) |
| `result.status` | Yes | `"success"`, `"failure"`, or `"partial"` |
| `result.summary` | Yes | Human-readable summary |
| `constraints_applied` | No | Constraint IDs from recall |
| `risk_flags` | No | Array of risk flag strings |
| `links.nodes` | No | Node IDs to link this run to |
| `tags` | No | Array of searchable tags |

---

## Knowledge Tree Operations

### Upsert a Node

Create or update a knowledge node (task, decision, pattern, constraint, etc.).

```bash
curl -s -X POST http://127.0.0.1:7337/nodes/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "id": "task_example_001",
    "type": "task",
    "title": "Example task",
    "status": "active",
    "tags": ["example"],
    "owners": ["your_agent_id"],
    "constraints": [],
    "body": "Description of the task.",
    "refs": {
      "runs": [],
      "files": ["src/example.ts"]
    },
    "next_actions": [
      "First thing to do",
      "Second thing to do"
    ]
  }'
```

Node types: `project`, `goal`, `task`, `decision`, `pattern`, `constraint`, `playbook`, `agent`.

Node statuses: `active`, `completed`, `archived`, `blocked`.

---

## Quick Reference

| Action | Method | Endpoint | When |
|--------|--------|----------|------|
| Recall context | `GET` | `/recall?q=<query>` | Before acting |
| Check policy | `POST` | `/policy/check` | Before executing commands/paths/hosts |
| Record checkpoint | `POST` | `/runs` | After acting |
| Upsert knowledge | `POST` | `/nodes/upsert` | When creating/updating knowledge |
| Health check | `GET` | `/health` | To verify API is running |

---

## Error Handling

| HTTP Status | Meaning |
|-------------|---------|
| `200` | Success |
| `201` | Created (checkpoint recorded) |
| `400` | Validation error — check request body |
| `403` | Policy denied — do not proceed |
| `401` | Authentication required — include `X-MB-TOKEN` header |

On validation errors, the response includes details:

```json
{
  "error": "Validation failed",
  "details": "agent.id: Required; intent.goal: Required"
}
```

---

## Scoped Memory (Contexts)

Mother Brain supports a 3-level hierarchy for memory isolation: **Global → Vertical → Project**.

### Check Current Context

Before recall, check if a context is active:

```bash
curl -s http://127.0.0.1:7337/contexts/current
```

### Context-Aware Recall

Include `context_id` in recall to scope results:

```bash
# Recall within a specific project context
curl -s "http://127.0.0.1:7337/recall?q=deploy&context_id=ctx_project_xxx"

# Cross-combination: query across multiple contexts
curl -s "http://127.0.0.1:7337/recall?q=deploy&context_ids=ctx_project_xxx,ctx_project_yyy"
```

### Context-Aware Recording

Include `context_id` in record payloads:

```bash
curl -s -X POST http://127.0.0.1:7337/runs \
  -H "Content-Type: application/json" \
  -d '{"context_id": "ctx_project_xxx", "agent": {...}, ...}'
```

### X-MB-CONTEXT Header

As an alternative to including `context_id` in every payload, set the `X-MB-CONTEXT` header:

```bash
curl -s -H "X-MB-CONTEXT: ctx_project_xxx" "http://127.0.0.1:7337/recall?q=deploy"
```

The header is used as a fallback when no `context_id` is present in the body or query parameters.

### Inheritance Rules

- **Project** recall returns: project + parent vertical + global data
- **Vertical** recall returns: vertical + global data
- **Global** recall (no context): returns all data
- Sibling projects are isolated from each other

---

## Summary

1. **Always recall before acting** — get context, constraints, and suggested actions.
2. **Always check policy before executing** — never bypass a denied action.
3. **Always record after acting** — persist what you did for future agents.
4. **Link your runs to knowledge nodes** — build the knowledge graph over time.
5. **Use contexts for isolation** — scope memory by vertical and project to avoid cross-contamination.
