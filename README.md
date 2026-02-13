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

### One-liner (macOS and Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash
```

That's it. After running this command, `motherbrain` is available as a global command in your terminal.

#### What install.sh does, step by step

1. Detects your operating system and architecture (`uname -s`, `uname -m`)
2. Queries the GitHub Releases API to resolve the latest version
3. Downloads the correct tarball for your platform (e.g. `motherbrain-v0.1.0-darwin-arm64.tar.gz`)
4. Downloads the checksums file and verifies the SHA-256 of the tarball
5. Extracts the full bundle to `~/.motherbrain/current/` — includes a bundled Node.js runtime, the compiled app, and all native dependencies
6. Creates a symlink at `/usr/local/bin/motherbrain` (if writable or sudo is available) — otherwise falls back to `~/.local/bin/motherbrain`
7. Validates the installation by running `motherbrain --version`

After installation, open a **new terminal** (or run `source ~/.bashrc` / `source ~/.zshrc`) and the `motherbrain` command will be available:

```bash
motherbrain --version
# mother-brain/0.1.0 darwin-arm64 node-v22.12.0

motherbrain --help
```

#### Supported platforms

| OS    | Architecture | Supported |
|-------|--------------|-----------|
| macOS | arm64 (Apple Silicon) | Yes |
| macOS | x64 (Intel) | Yes |
| Linux | x64 | Yes |
| Linux | arm64 | Yes |

#### Install variants

```bash
# Install a specific version
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash -s -- --version v0.2.0

# Review the script before running (recommended for security-conscious users)
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh -o install.sh
less install.sh
bash install.sh

# Custom symlink directory
MB_INSTALL_DIR=~/bin curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash

# Custom bundle home directory (default: ~/.motherbrain)
MB_HOME=/opt/motherbrain curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/install.sh | bash
```

#### If `~/.local/bin` is not in your PATH

If the installer used `~/.local/bin` (because sudo is not available), add it to your shell profile:

```bash
# For bash (~/.bashrc)
echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> ~/.bashrc
source ~/.bashrc

# For zsh (~/.zshrc)
echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> ~/.zshrc
source ~/.zshrc
```

#### Requirements

- **Binary install:** bash, curl, tar — **no Node.js required** (the runtime is bundled)
- **From source:** Node.js >= 20, pnpm

---

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/lucmousinho/mother-brain/main/uninstall.sh | bash
```

#### What uninstall.sh does

1. Locates the `motherbrain` symlink in PATH (`/usr/local/bin` or `~/.local/bin`)
2. Removes the symlink (requests sudo if needed)
3. Removes the bundle directory `~/.motherbrain/` containing Node.js and the app
4. Does **not** remove project data (`./motherbrain/`, `./storage/`, `./policies/`) — those remain untouched

#### Manual uninstall

```bash
# Remove the symlink
sudo rm /usr/local/bin/motherbrain
# or: rm ~/.local/bin/motherbrain

# Remove the bundle
rm -rf ~/.motherbrain
```

---

### Install from source (for development)

```bash
git clone https://github.com/lucmousinho/mother-brain.git && cd mother-brain
pnpm install
pnpm build
node --no-warnings bin/run.js --help
```

---

## Quick Start

After installation, the `motherbrain` command is available in your terminal. All **CLI commands** (init, record, recall, etc.) work immediately. The **local API** must be started manually — see below.

```bash
# 1. Initialize project structure (folders, policies, storage)
motherbrain init

# 2. Enable repo mode (creates VERSION file)
motherbrain enable

# 3. Start the local API (port 7337) — runs in foreground
motherbrain api start

# 4. Record a checkpoint (in another terminal, or before starting the API)
motherbrain record --file examples/example_run_checkpoint.json

# 5. Create/update a node in the knowledge tree
motherbrain upsert-node --file examples/example_node_task.json

# 6. Search for context (hybrid recall)
motherbrain recall "deploy"

# 7. Check policy (exit code 0 = allowed, 3 = denied)
motherbrain policy-check --cmd "git push origin main"
motherbrain policy-check --cmd "rm -rf /"

# 8. Generate snapshot (current_context.md + active_tasks.json)
motherbrain snapshot

# 9. Compact a day's checkpoints into patterns + summary
motherbrain compact --day 2025-01-15
```

### About the local API

The API does **not** start automatically after installation. It is a local Fastify server that runs in the foreground when you execute `motherbrain api start`. To keep it running in the background:

```bash
# Option 1: run in background with nohup
nohup motherbrain api start &

# Option 2: run in background and redirect logs
motherbrain api start > /tmp/motherbrain-api.log 2>&1 &

# Check if it's running
curl http://127.0.0.1:7337/health
```

#### Persist the API as a service (optional)

**macOS (launchd):**

```bash
cat > ~/Library/LaunchAgents/com.motherbrain.api.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.motherbrain.api</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/motherbrain</string>
    <string>api</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>/Users/YOUR_USER/your-project</string>
  <key>StandardOutPath</key>
  <string>/tmp/motherbrain-api.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/motherbrain-api.log</string>
</dict>
</plist>
EOF

# Enable
launchctl load ~/Library/LaunchAgents/com.motherbrain.api.plist

# Disable
launchctl unload ~/Library/LaunchAgents/com.motherbrain.api.plist
```

**Linux (systemd):**

```bash
sudo tee /etc/systemd/system/motherbrain-api.service << 'EOF'
[Unit]
Description=Mother Brain API
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/motherbrain api start
WorkingDirectory=/home/YOUR_USER/your-project
Restart=on-failure
RestartSec=5
User=YOUR_USER

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable motherbrain-api
sudo systemctl start motherbrain-api

# Check status / logs
sudo systemctl status motherbrain-api
journalctl -u motherbrain-api -f
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
    core/                     # Business logic
    db/                       # SQLite database layer
    adapters/openclaw/        # OpenClaw adapter
    utils/                    # Utilities (paths, IDs, filelock, markdown)
  scripts/                    # Build and packaging scripts
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
  |
  +-- 1. GET /recall?q="current task"     -> context + constraints
  +-- 2. POST /policy/check               -> allow/deny
  +-- 3. [execute action]
  +-- 4. POST /runs                        -> persist checkpoint
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
