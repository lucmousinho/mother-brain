# Mother Brain

**CLI + local API for agent run checkpoints, knowledge tree, hybrid recall, and policy gate.**

Mother Brain provides a unified system to capture, organize, and recall context across multiple AI agents — all running offline and locally.

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

## Setup

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

### Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--with-token` | `-t` | Generate a random `MB_TOKEN` in `.env` |
| `--port <number>` | `-p` | Set `MB_API_PORT` (default 7337) |
| `--force` | `-f` | Overwrite existing `.env` |

### Examples

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

### After setup

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
Read https://raw.githubusercontent.com/lucmousinho/mother-brain/main/skill.md and follow the instructions.
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

See `src/adapters/openclaw/adapter.ts` for a reference mapping from OpenClaw events to Mother Brain checkpoints. See `skill.md` for the complete agent integration guide.

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

## CLI Commands

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

## Running as a Service

The API runs in the foreground by default. To keep it running in the background:

```bash
# Option 1: nohup
nohup motherbrain api start &

# Option 2: redirect logs
motherbrain api start > /tmp/motherbrain-api.log 2>&1 &

# Check if it's running
curl http://127.0.0.1:7337/health
```

### macOS (launchd)

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

### Linux (systemd)

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

## Configuration

The quickest way to configure Mother Brain is via the setup command:

```bash
motherbrain setup --with-token --port 7337
```

This creates `.env` from `.env.example` with your chosen options. To configure manually:

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
pnpm dev setup --with-token
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
