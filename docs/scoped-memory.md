# Scoped Memory System

Mother Brain organizes memory into a **3-level hierarchy** that enables isolation between projects while sharing common knowledge upward through inheritance.

## Hierarchy

```
GLOBAL (__global__)
  ├── healthcare (vertical)
  │   ├── project-alpha (project)
  │   └── project-gamma (project)
  └── fintech (vertical)
      └── project-beta (project)
```

| Level | Scope | Description |
|-------|-------|-------------|
| 1 | **Global** | Root scope. Sentinel ID: `__global__`. All existing data lives here. |
| 2 | **Vertical** | Industry sector (e.g. healthcare, fintech, gaming). Parent is always Global. |
| 3 | **Project** | Specific project within a vertical (e.g. project-alpha, project-beta). Parent is always a Vertical. |

## Inheritance Rules

- A **project** inherits from its parent **vertical** and from **global**
- A **vertical** inherits from **global**
- Recall in a project scope returns data from: project + vertical + global
- Sibling projects are **isolated** — project A cannot see project B's data
- Vertical recall does NOT include child project data (only vertical + global)
- Unscoped recall (no context) returns **all data** (backwards compatible)

## Context Resolution

When no explicit context is provided, the system resolves in this order:

1. **Explicit ID** — `contextId` parameter or `context_id` in body/query
2. **Active context file** — `storage/active_context.json` (set via `context use`)
3. **Global** — `__global__` sentinel (default)

## Ancestor Chain

Every context has a materialized `scope_path` and an ancestor chain. For a project context:

```
scope_path: __global__/ctx_vertical_xxx/ctx_project_yyy
ancestor_chain: [ctx_project_yyy, ctx_vertical_xxx, __global__]
```

When recall is scoped to a context, the system resolves the full ancestor chain and includes data from **all ancestors** in the results.

## Cross-Combination

Pass multiple context IDs to recall across multiple projects simultaneously:

```bash
# CLI
motherbrain recall "deploy" --contexts ctx_project_xxx,ctx_project_yyy

# API
curl "http://127.0.0.1:7337/recall?q=deploy&context_ids=ctx_project_xxx,ctx_project_yyy"
```

The system unions the ancestor chains of all provided contexts. For two projects in different verticals, this gives access to both projects, both verticals, and global.

## CLI Usage

```bash
# Create a vertical
motherbrain context create --name healthcare --scope vertical

# Create a project under the vertical
motherbrain context create --name project-alpha --scope project --parent healthcare

# Set active context (all subsequent operations use this scope)
motherbrain context use project-alpha

# Check current context
motherbrain context current

# Record within a context (explicit, overrides active context)
motherbrain record --file run.json --context project-alpha

# Recall within a context
motherbrain recall "deploy" --context project-alpha

# View hierarchy
motherbrain context list --format tree
```

## API Usage

### X-MB-CONTEXT Header

Set the `X-MB-CONTEXT` header to scope all requests in a session:

```bash
curl -H "X-MB-CONTEXT: ctx_project_xxx" \
  "http://127.0.0.1:7337/recall?q=deploy"
```

### Body / Query Parameter

Include `context_id` directly in request bodies or query parameters:

```bash
# In record body
curl -X POST http://127.0.0.1:7337/runs \
  -H "Content-Type: application/json" \
  -d '{"context_id": "ctx_project_xxx", ...}'

# In recall query
curl "http://127.0.0.1:7337/recall?q=deploy&context_id=ctx_project_xxx"
```

## Database Schema

The `contexts` table stores all context metadata:

```sql
CREATE TABLE contexts (
  context_id    TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  scope         TEXT NOT NULL CHECK (scope IN ('global', 'vertical', 'project')),
  parent_id     TEXT,
  scope_path    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (parent_id) REFERENCES contexts(context_id)
);
```

The `runs` and `nodes` tables have a `context_id` column (defaulting to `__global__`) that associates each record with a scope.

## Migration

The migration is idempotent and runs automatically on database initialization:

1. `ALTER TABLE runs ADD COLUMN context_id` (catch duplicate column error)
2. `ALTER TABLE nodes ADD COLUMN context_id` (catch duplicate column error)
3. Seed the global context row
4. Backfill any empty `context_id` values to `__global__`

All existing data is automatically attributed to the global scope with zero manual intervention.
