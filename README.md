# Mother Brain

**CLI + local API for agent run checkpoints, knowledge tree, hybrid recall, and policy gate.**

Mother Brain provides a unified system to capture, organize, and recall context across multiple AI agents — all running offline and locally.

---

## Concepts

### Checkpoints (Runs)
Every agent execution is captured as a **Run Checkpoint** — an append-only JSON file stored in `motherbrain/checkpoints/v1/YYYY/MM/run_<id>.json`. Each checkpoint contains the agent identity, intent, plan, actions taken, files touched, artifacts, result, constraints applied, and risk flags. Checkpoints are never modified after creation.

### Knowledge Tree
A curated tree of knowledge nodes in `motherbrain/tree/<type>/`. Node types include: **projects**, **goals**, **tasks**, **decisions**, **patterns**, **constraints**, **playbooks**, and **agents**. Each node is a Markdown file with YAML frontmatter and structured sections (Context, References, Next Actions). Nodes are also indexed in SQLite for fast search.

### Recall
Hybrid search over runs and nodes using keyword matching, tag filtering, and recency scoring. Returns the most relevant runs, nodes, applicable constraints, and suggested next actions. Designed to be called **before** an agent executes, providing full context.

### Policy Gate
Allow/deny rules for commands, paths, and hosts. Denylist always wins. If an allowlist exists and a value doesn't match, it's denied. All checks are audited in SQLite. Dangerous commands (`rm -rf /`, `curl | bash`, `mkfs`, etc.) and sensitive paths (`~/.ssh`, `~/.pgpass`) are denied by default.

### Snapshots
Materialized views of the current state: `current_context.md` (human-readable) and `active_tasks.json` (machine-readable). Generated on demand via `snapshot`.

### Compaction
Daily compaction reads all checkpoints for a given day and produces patterns/decisions nodes plus a daily summary markdown.

---

## Installation

```bash
# Clone the repo
git clone <repo-url> mother-brain && cd mother-brain

# Install dependencies
pnpm install

# Build
pnpm build

# (Optional) Link the CLI globally
pnpm link --global
```

### Requirements
- Node.js >= 20
- pnpm (or npm)

---

## Quick Start

```bash
# 1. Initialize project structure
motherbrain init

# 2. Enable repo mode (creates VERSION file)
motherbrain enable

# 3. Start the local API
motherbrain api start

# 4. Record a checkpoint
motherbrain record --file examples/example_run_checkpoint.json

# 5. Upsert a knowledge node
motherbrain upsert-node --file examples/example_node_task.json

# 6. Recall context
motherbrain recall "deploy"

# 7. Check a policy
motherbrain policy-check --cmd "git push origin main"
motherbrain policy-check --cmd "rm -rf /"

# 8. Generate snapshot
motherbrain snapshot

# 9. Compact a day
motherbrain compact --day 2025-01-15
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `motherbrain init` | Create folder structure, default policies, storage |
| `motherbrain enable` | Activate repo mode, create VERSION file |
| `motherbrain api start` | Start Fastify API on port 7337 |
| `motherbrain record` | Record a Run Checkpoint (stdin or `--file`) |
| `motherbrain upsert-node` | Create/update a knowledge tree node |
| `motherbrain recall "<query>"` | Hybrid search over runs + nodes |
| `motherbrain policy-check` | Validate cmd/path/host against policies |
| `motherbrain snapshot` | Generate materialized snapshots |
| `motherbrain compact --day YYYY-MM-DD` | Compact a day into patterns + summary |

### record

```bash
# From file
motherbrain record --file run.json

# From stdin
cat run.json | motherbrain record
```

### upsert-node

```bash
# From file
motherbrain upsert-node --file node.json

# From flags
motherbrain upsert-node \
  --id task_001 \
  --type task \
  --title "Deploy staging" \
  --status active \
  --tags deploy,staging
```

### recall

```bash
# JSON output (default)
motherbrain recall "deploy staging"

# Markdown output
motherbrain recall "deploy" --format md

# With filters
motherbrain recall "auth" --limit 5 --tags backend --types task,decision
```

### policy-check

```bash
# Returns exit code 0 (allowed) or 3 (denied)
motherbrain policy-check --cmd "git push origin main"
echo $?  # 0

motherbrain policy-check --cmd "rm -rf /"
echo $?  # 3

motherbrain policy-check --path "~/.ssh"
echo $?  # 3
```

---

## API Endpoints

Start with `motherbrain api start` (default port 7337).

If `MB_TOKEN` is set in `.env`, all requests (except `/health`) require header `X-MB-TOKEN`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/runs` | Record a checkpoint |
| `POST` | `/nodes/upsert` | Create/update a node |
| `GET` | `/recall?q=...` | Hybrid recall |
| `POST` | `/policy/check` | Policy check |

### Examples

```bash
# Health
curl http://127.0.0.1:7337/health

# Record a run
curl -X POST http://127.0.0.1:7337/runs \
  -H "Content-Type: application/json" \
  -d @examples/example_run_checkpoint.json

# Upsert a node
curl -X POST http://127.0.0.1:7337/nodes/upsert \
  -H "Content-Type: application/json" \
  -d @examples/example_node_task.json

# Recall
curl "http://127.0.0.1:7337/recall?q=deploy&limit=5"

# Policy check
curl -X POST http://127.0.0.1:7337/policy/check \
  -H "Content-Type: application/json" \
  -d '{"cmd": "rm -rf /"}'
```

---

## Project Structure

```
mother-brain/
  bin/run.js                  # CLI entry point
  docs/                       # Documentation
  motherbrain/                # Git-friendly versioned data
    checkpoints/v1/           # Append-only run checkpoints (YYYY/MM/)
    tree/                     # Knowledge tree
      projects/
      goals/
      tasks/
      decisions/
      patterns/
      constraints/
      playbooks/
      agents/
    links/by-run/             # Run-to-node links
    snapshots/                # Materialized snapshots
  storage/                    # Local non-versioned state (gitignored)
    locks/                    # File locks
    motherbrain.sqlite        # SQLite DB
  policies/                   # Allow/deny policy files
  src/
    cli/commands/             # oclif CLI commands
    api/                      # Fastify API server + routes
    core/                     # Business logic (schemas, checkpoint, tree, recall, policy, snapshot, compact)
    db/                       # SQLite database layer
    adapters/openclaw/        # OpenClaw adapter
    utils/                    # Utilities (paths, IDs, filelock, markdown)
  templates/                  # Templates for nodes and checkpoints
  examples/                   # Example JSON files
  tests/                      # Vitest tests
```

---

## Integration with OpenClaw

Mother Brain is designed to complement OpenClaw's memory architecture:

1. **Before agent action**: Call `recall` to get relevant context, constraints, and suggested actions.
2. **Before executing**: Call `policy-check` for each command/path/host to enforce security.
3. **After agent action**: Call `record` to persist the run checkpoint.

```
OpenClaw Agent
  │
  ├── 1. GET /recall?q="current task"     → context + constraints
  ├── 2. POST /policy/check               → allow/deny
  ├── 3. [execute action]
  └── 4. POST /runs                        → persist checkpoint
```

See `src/adapters/openclaw/adapter.ts` for a reference mapping from OpenClaw events to Mother Brain checkpoints.

---

## Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `MB_TOKEN` | _(empty)_ | API auth token (header `X-MB-TOKEN`) |
| `MB_API_PORT` | `7337` | API port |
| `MB_DATA_DIR` | `./motherbrain` | Versioned data directory |
| `MB_STORAGE_DIR` | `./storage` | Local state directory |

---

## Development

```bash
# Run CLI in dev mode (no build needed)
pnpm dev init
pnpm dev record --file examples/example_run_checkpoint.json

# Run tests
pnpm test

# Lint
pnpm lint

# Format
pnpm format
```

---

## License

MIT
