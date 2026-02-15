# CLI Reference

## Commands

| Command | Description |
|---------|-------------|
| `motherbrain setup` | Initialize project, configure .env, enable repo mode |
| `motherbrain init` | Create folder structure, default policies, storage |
| `motherbrain enable` | Activate repo mode, create VERSION file |
| `motherbrain api start` | Start Fastify API on port 7337 |
| `motherbrain record` | Record a Run Checkpoint (stdin or `--file`) |
| `motherbrain upsert-node` | Create/update a knowledge tree node |
| `motherbrain recall "<query>"` | Hybrid search over runs + nodes |
| `motherbrain policy-check` | Validate cmd/path/host against policies |
| `motherbrain snapshot` | Generate materialized snapshots |
| `motherbrain compact --day YYYY-MM-DD` | Compact a day into patterns + summary |
| `motherbrain embed-model warmup` | Download model and verify offline readiness |
| `motherbrain embed-model info` | Show model config, vector store status |
| `motherbrain self-update` | Update CLI to latest version from GitHub Releases |
| `motherbrain context create` | Create a new memory context (vertical or project) |
| `motherbrain context use <name>` | Set the active memory context |
| `motherbrain context current` | Show current context and inheritance chain |
| `motherbrain context list` | List all contexts (JSON or tree format) |

---

## record

Record a Run Checkpoint from stdin JSON or a file. Validates with Zod, generates run_id if missing.

```bash
# From file
motherbrain record --file run.json

# From stdin
cat run.json | motherbrain record

# Within a specific context
motherbrain record --file run.json --context drclick
```

| Flag | Short | Description |
|------|-------|-------------|
| `--file` | `-f` | Path to checkpoint JSON file |
| `--context` | `-c` | Context ID or name for scoped recording |

---

## upsert-node

Create or update a knowledge tree node.

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

# Within a context
motherbrain upsert-node --file node.json --context drclick
```

| Flag | Short | Description |
|------|-------|-------------|
| `--file` | `-f` | Path to node JSON file |
| `--id` | | Node ID |
| `--type` | `-t` | Node type (project, goal, task, decision, pattern, constraint, playbook, agent) |
| `--title` | | Node title |
| `--status` | `-s` | Node status (active, done, archived, blocked, draft) |
| `--tags` | | Comma-separated tags |
| `--body` | | Node body text |
| `--context` | `-c` | Context ID or name for scoped node |

---

## recall

Hybrid recall: search runs and nodes by keyword, semantic similarity, or both.

```bash
# JSON output (default -- keyword mode)
motherbrain recall "deploy staging"

# Markdown output
motherbrain recall "deploy" --format md

# With filters
motherbrain recall "auth" --limit 5 --tags backend --types task,decision

# Semantic search (vector similarity)
motherbrain recall "deploy staging" --mode semantic

# Hybrid search (keyword + vector combined)
motherbrain recall "auth refactor" --mode hybrid

# Scoped recall
motherbrain recall "deploy" --context drclick

# Cross-combination recall
motherbrain recall "deploy" --contexts ctx_project_xxx,ctx_project_yyy
```

| Flag | Short | Description |
|------|-------|-------------|
| `--format` | | Output format: `json` (default) or `md` |
| `--limit` | `-l` | Max results per category (default 10) |
| `--tags` | | Comma-separated tags to filter by |
| `--types` | | Comma-separated node types to filter by |
| `--mode` | `-m` | Recall mode: `keyword`, `semantic`, or `hybrid` |
| `--context` | `-c` | Context ID or name for scoped recall |
| `--contexts` | | Comma-separated context IDs for cross-combination |

---

## context create

Create a new memory context (vertical or project).

```bash
# Create a vertical
motherbrain context create --name saude --scope vertical

# Create a project under a vertical
motherbrain context create --name drclick --scope project --parent saude
```

| Flag | Short | Description |
|------|-------|-------------|
| `--name` | `-n` | Context name (required) |
| `--scope` | `-s` | Context scope: `vertical` or `project` (required) |
| `--parent` | `-p` | Parent context name or ID (required for project scope) |

---

## context use

Set the active memory context by name or ID.

```bash
motherbrain context use drclick
motherbrain context use __global__
```

Setting the context to `__global__` clears the active context file.

---

## context current

Show the current active memory context and its inheritance chain.

```bash
motherbrain context current
```

Output example:

```
Active context: drclick (ctx_project_01jxyz)
Scope: project
Path: __global__/ctx_vertical_01jabc/ctx_project_01jxyz
Set at: 2025-01-15T10:00:00.000Z

Inheritance chain:
  PROJECT: drclick (ctx_project_01jxyz)
  VERTICAL: saude (ctx_vertical_01jabc)
  GLOBAL: Global (__global__)
```

---

## context list

List all memory contexts.

```bash
# JSON output
motherbrain context list

# Filter by scope
motherbrain context list --scope vertical

# Tree view
motherbrain context list --format tree
```

Tree output example:

```
GLOBAL (__global__)
  ├── saude (ctx_vertical_xxx)
  │   ├── drclick (ctx_project_xxx)
  │   └── medapp (ctx_project_xxx)
  └── educacao (ctx_vertical_xxx)
      └── ativedu (ctx_project_xxx)
```

| Flag | Short | Description |
|------|-------|-------------|
| `--scope` | `-s` | Filter by scope: `global`, `vertical`, or `project` |
| `--parent` | `-p` | Filter by parent context ID |
| `--format` | `-f` | Output format: `json` (default) or `tree` |

---

## policy-check

Validate a command, path, or host against project policies.

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

## snapshot

Generate materialized context + task snapshots.

```bash
motherbrain snapshot
```

---

## compact

Compact a day's runs into patterns + summary.

```bash
motherbrain compact --day 2025-01-15
```

---

## embed-model warmup

Pre-download the embedding model so the first recall is fast.

```bash
motherbrain embed-model warmup
```

---

## embed-model info

Show model config and vector store status.

```bash
motherbrain embed-model info
```

---

## self-update

Update CLI to latest version from GitHub Releases. See [Installation](./installation.md#updating) for details.
