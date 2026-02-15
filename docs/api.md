# API Reference

Start the API with `motherbrain api start` (default port 7337).

## Authentication

If `MB_TOKEN` is set in `.env`, all requests (except `/health`) require header `X-MB-TOKEN`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/runs` | Record a checkpoint |
| `POST` | `/nodes/upsert` | Create/update a node |
| `GET` | `/recall?q=...&mode=...` | Recall (keyword / semantic / hybrid) |
| `POST` | `/policy/check` | Policy check |
| `POST` | `/contexts` | Create a new context |
| `GET` | `/contexts` | List contexts |
| `GET` | `/contexts/current` | Get active context + chain |
| `PUT` | `/contexts/current` | Set active context |
| `GET` | `/contexts/:id` | Get single context |

All endpoints that accept data (`/runs`, `/nodes/upsert`, `/recall`) support context scoping via `context_id` in body/query or `X-MB-CONTEXT` header.

---

## Health

```bash
curl http://127.0.0.1:7337/health
```

Response:

```json
{"status": "ok", "version": "v1", "timestamp": "2025-01-15T10:00:00.000Z"}
```

---

## Record Run Checkpoint

```bash
curl -X POST http://127.0.0.1:7337/runs \
  -H "Content-Type: application/json" \
  -d @examples/example_run_checkpoint.json
```

### Request Body

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
| `result.status` | Yes | `"success"`, `"failure"`, `"partial"`, or `"aborted"` |
| `result.summary` | Yes | Human-readable summary |
| `constraints_applied` | No | Constraint IDs from recall |
| `risk_flags` | No | Array of risk flag strings |
| `links.nodes` | No | Node IDs to link this run to |
| `tags` | No | Array of searchable tags |
| `context_id` | No | Context for scoped recording |

### Response (201)

```json
{
  "run_id": "run_01JEXAMPLE123",
  "file_path": "motherbrain/checkpoints/v1/2025/01/run_01JEXAMPLE123.json",
  "linked_nodes": ["task_001"]
}
```

---

## Upsert Node

```bash
curl -X POST http://127.0.0.1:7337/nodes/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "id": "task_example_001",
    "type": "task",
    "title": "Example task",
    "status": "active",
    "tags": ["example"],
    "body": "Description of the task.",
    "context_id": "ctx_project_xxx"
  }'
```

Node types: `project`, `goal`, `task`, `decision`, `pattern`, `constraint`, `playbook`, `agent`.

Node statuses: `active`, `done`, `archived`, `blocked`, `draft`.

---

## Recall

```bash
curl "http://127.0.0.1:7337/recall?q=deploy&limit=5"
```

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `q` | Yes | Search query |
| `limit` | No | Max results per category (default 10, max 50) |
| `tags` | No | Comma-separated tag filter |
| `types` | No | Comma-separated node type filter |
| `mode` | No | `keyword` (default), `semantic`, or `hybrid` |
| `context_id` | No | Single context ID for scoped recall |
| `context_ids` | No | Comma-separated context IDs for cross-combination |

### Response

```json
{
  "query": "deploy",
  "mode": "keyword",
  "source": "keyword",
  "top_runs": [...],
  "top_nodes": [...],
  "applicable_constraints": [...],
  "suggested_next_actions": [...]
}
```

---

## Policy Check

```bash
curl -X POST http://127.0.0.1:7337/policy/check \
  -H "Content-Type: application/json" \
  -d '{"cmd": "rm -rf /"}'
```

- HTTP `200` = allowed
- HTTP `403` = denied

---

## Context CRUD

### Create Context

```bash
curl -X POST http://127.0.0.1:7337/contexts \
  -H "Content-Type: application/json" \
  -d '{"name": "healthcare", "scope": "vertical"}'
```

```bash
curl -X POST http://127.0.0.1:7337/contexts \
  -H "Content-Type: application/json" \
  -d '{"name": "project-alpha", "scope": "project", "parent_id": "ctx_vertical_xxx"}'
```

### List Contexts

```bash
curl "http://127.0.0.1:7337/contexts"
curl "http://127.0.0.1:7337/contexts?scope=vertical"
curl "http://127.0.0.1:7337/contexts?parent=ctx_vertical_xxx"
```

### Get Current Context

```bash
curl "http://127.0.0.1:7337/contexts/current"
```

Returns the active context info plus the ancestor chain.

### Set Active Context

```bash
curl -X PUT http://127.0.0.1:7337/contexts/current \
  -H "Content-Type: application/json" \
  -d '{"context_id": "ctx_project_xxx"}'
```

### Get Context by ID

```bash
curl "http://127.0.0.1:7337/contexts/ctx_project_xxx"
```

---

## X-MB-CONTEXT Header

As an alternative to including `context_id` in every request body or query, set the `X-MB-CONTEXT` header:

```bash
curl -H "X-MB-CONTEXT: ctx_project_xxx" "http://127.0.0.1:7337/recall?q=deploy"
```

The header is used as a fallback when no `context_id` is present in the body or query parameters.

---

## Error Handling

| HTTP Status | Meaning |
|-------------|---------|
| `200` | Success |
| `201` | Created (checkpoint recorded) |
| `400` | Validation error — check request body |
| `403` | Policy denied — do not proceed |
| `401` | Authentication required — include `X-MB-TOKEN` header |
| `404` | Resource not found |

On validation errors, the response includes details:

```json
{
  "error": "Validation failed",
  "details": "agent.id: Required; intent.goal: Required"
}
```
