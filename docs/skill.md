---
name: motherbrain
description: Long-term structured memory for OpenClaw agents. Record actions, recall context, manage scoped memory with hierarchical isolation. Use when you need to remember past work, record what you did, or organize memory by project/vertical.
homepage: https://github.com/lucmousinho/mother-brain
metadata: { "openclaw": { "emoji": "🧠", "requires": { "bins": ["motherbrain", "curl", "python3"] } } }
---

# Mother Brain — Structured Long-Term Memory for OpenClaw

Mother Brain (MB) is a local-first memory system that gives OpenClaw agents persistent, structured, scoped memory across sessions. It stores **run checkpoints** (what you did), **knowledge nodes** (what you know), and **policies** (constraints), all searchable via keyword + semantic hybrid recall.

## Why

OpenClaw agents wake up fresh every session. Local files (`MEMORY.md`, `memory/*.md`) help, but they're flat, unsearchable, and unscoped. Mother Brain adds:

- **Structured storage** — checkpoints with goals, summaries, tags, timestamps
- **Hybrid search** — keyword + vector semantic (local embeddings, no API key needed)
- **Scoped memory** — hierarchical contexts (global → vertical → project)
- **Isolation** — agents/projects only see their own context + ancestors
- **Compaction** — daily summaries, pattern detection, snapshot generation

## Architecture

```
┌─────────────────────────────────────────────┐
│                  OpenClaw Agent              │
│  (reads AGENTS.md → calls mb-recall/record) │
└──────────┬──────────────────┬───────────────┘
           │ recall           │ record
           ▼                  ▼
┌─────────────────────────────────────────────┐
│           Mother Brain API (:7337)           │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ SQLite  │ │ LanceDB  │ │ Checkpoints  │ │
│  │ (runs,  │ │ (vectors │ │ (JSON files) │ │
│  │  nodes) │ │  384-dim) │ │              │ │
│  └─────────┘ └──────────┘ └──────────────┘ │
│  Embeddings: Xenova/all-MiniLM-L6-v2 local  │
└─────────────────────────────────────────────┘
```

## Installation

```bash
# Install Mother Brain CLI
motherbrain self-update  # or download from GitHub releases

# Initialize in your OpenClaw workspace
cd ~/.openclaw/workspace
motherbrain setup --with-token
motherbrain init
```

This creates:
- `.env` with `MB_TOKEN`, `MB_API_PORT=7337`, `MB_RECALL_MODE=hybrid`
- `motherbrain/` data directory (checkpoints, links, snapshots, tree)
- `storage/` directory (SQLite DB, vector store, model cache)

## Running the API

### Manual

```bash
cd ~/.openclaw/workspace
motherbrain api start
```

### As a systemd user service (recommended)

Create `~/.config/systemd/user/motherbrain-openclaw.service`:

```ini
[Unit]
Description=Mother Brain API for OpenClaw workspace
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/USER/.openclaw/workspace
ExecStart=/home/USER/.local/bin/motherbrain api start
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

Then:

```bash
systemctl --user daemon-reload
systemctl --user enable --now motherbrain-openclaw.service
```

## Helper Scripts

Create these in your workspace `scripts/` directory. They wrap the MB CLI/API for easy agent use.

### scripts/mb-recall

Search memory (hybrid keyword + semantic). Auto-detects context from keywords.

```bash
#!/usr/bin/env bash
set -euo pipefail

Q="${1:-}"
LIMIT="${2:-5}"
CONTEXT="${MB_CONTEXT:-}"

if [ -z "$Q" ]; then
  echo "usage: mb-recall \"query\" [limit]" >&2
  exit 1
fi

cd ~/.openclaw/workspace
TOKEN="$(grep '^MB_TOKEN=' .env | cut -d= -f2- || true)"
if [ -z "$TOKEN" ]; then
  echo '{"error":"MB_TOKEN missing in .env"}'
  exit 2
fi

# Auto-detect context from query keywords (customize these for your verticals)
if [ -z "$CONTEXT" ]; then
  Q_LOWER="$(echo "$Q" | tr '[:upper:]' '[:lower:]')"
  case "$Q_LOWER" in
    *health*|*hospital*|*clinic*) CONTEXT="healthtech" ;;
    *game*|*gaming*|*unity*) CONTEXT="games" ;;
    *education*|*school*|*lms*) CONTEXT="edtech" ;;
    # Add your own verticals here
  esac
fi

ENC_Q="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$Q")"
URL="http://127.0.0.1:7337/recall?q=${ENC_Q}&mode=hybrid&limit=${LIMIT}"

if [ -n "$CONTEXT" ]; then
  ENC_CTX="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$CONTEXT")"
  URL="${URL}&context_id=${ENC_CTX}"
fi

curl -sS "$URL" -H "X-MB-TOKEN: $TOKEN"
```

### scripts/mb-record-action

Record a completed action as a checkpoint. This is the primary way to persist what you did.

```bash
#!/usr/bin/env bash
set -euo pipefail

# mb-record-action "goal" "summary" "tag1,tag2" "command" "detail" [context]
GOAL="${1:-}"
SUMMARY="${2:-}"
TAGS_RAW="${3:-openclaw}"
COMMAND="${4:-manual action}"
DETAIL="${5:-completed}"
CONTEXT="${6:-${MB_CONTEXT:-}}"

if [ -z "$GOAL" ] || [ -z "$SUMMARY" ]; then
  echo "usage: mb-record-action \"goal\" \"summary\" [tags] [command] [detail] [context]" >&2
  exit 1
fi

cd ~/.openclaw/workspace
TOKEN="$(grep '^MB_TOKEN=' .env | cut -d= -f2- || true)"
if [ -z "$TOKEN" ]; then
  echo '{"error":"MB_TOKEN missing in .env"}'
  exit 2
fi

NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TAG_JSON="$(python3 - <<'PY' "$TAGS_RAW"
import json,sys
print(json.dumps([t.strip() for t in sys.argv[1].split(',') if t.strip()]))
PY
)"

TMP="$(mktemp)"
cat > "$TMP" <<JSON
{
  "version": "v1",
  "timestamp": "$NOW",
  "agent": {"id": "openclaw-main", "name": "OpenClaw Agent", "session_id": "agent:main:main"},
  "intent": {"goal": "$GOAL", "context": ["motherbrain", "auto-record"]},
  "plan": [{"step": 1, "description": "$GOAL", "status": "done"}],
  "actions": [{"type": "tool", "command": "$COMMAND", "detail": "$DETAIL", "timestamp": "$NOW"}],
  "files_touched": [],
  "artifacts": [],
  "result": {"status": "success", "summary": "$SUMMARY"},
  "constraints_applied": [],
  "risk_flags": [],
  "links": {"nodes": []},
  "tags": $TAG_JSON
}
JSON

CTX_FLAG=""
[ -n "$CONTEXT" ] && CTX_FLAG="--context $CONTEXT"

motherbrain record --file "$TMP" $CTX_FLAG
rm -f "$TMP"
```

### scripts/mb-context-boot

Quick context loader for session startup. Checks if MB is alive first.

```bash
#!/usr/bin/env bash
set -euo pipefail

QUERY="${1:-recent work actions tasks completed}"
LIMIT="${2:-5}"

cd ~/.openclaw/workspace

if ! curl -sf http://127.0.0.1:7337/health > /dev/null 2>&1; then
  echo '{"status":"offline","message":"Mother Brain unavailable, use local files"}'
  exit 0
fi

exec scripts/mb-recall "$QUERY" "$LIMIT"
```

### scripts/mb-daily-maintenance

Daily compaction + snapshot. Run via cron or OpenClaw cron job.

```bash
#!/usr/bin/env bash
set -euo pipefail

cd ~/.openclaw/workspace
YESTERDAY="$(date -u -d 'yesterday' +%Y-%m-%d 2>/dev/null || date -u -v-1d +%Y-%m-%d)"

echo "[$(date -u +%H:%M:%S)] Compacting $YESTERDAY..."
motherbrain compact --day "$YESTERDAY" 2>&1 || echo "  compact: nothing to compact"

echo "[$(date -u +%H:%M:%S)] Generating snapshot..."
motherbrain snapshot 2>&1 || echo "  snapshot: error"

echo "[$(date -u +%H:%M:%S)] Done."
```

Make all scripts executable:

```bash
chmod +x scripts/mb-recall scripts/mb-record-action scripts/mb-context-boot scripts/mb-daily-maintenance
```

## Memory Contexts (Scoped Memory)

MB supports hierarchical memory scoping:

```
__global__              ← everything sees this
├── healthtech          ← vertical (scope: vertical)
│   └── drclick         ← project (scope: project, parent: healthtech)
├── games               ← vertical
│   └── mygame          ← project
└── edtech              ← vertical
```

### Key behaviors

- **Inheritance:** A project sees its own data + parent vertical + global
- **Isolation:** Verticals don't see each other's data
- **Global:** Sees everything (no filter)
- **Auto-resolution:** Names and IDs both work (`--context games` or `--context ctx_vert_abc123`)

### Creating contexts

```bash
# Create a vertical
motherbrain context create --name healthtech --scope vertical

# Create a project under a vertical
motherbrain context create --name drclick --scope project --parent healthtech

# Set active context (affects default scope for record/recall)
motherbrain context use healthtech

# List all
motherbrain context list
```

### Using contexts in scripts

```bash
# Scoped recall
MB_CONTEXT=games scripts/mb-recall "unity performance" 5

# Scoped recording
scripts/mb-record-action "Fix shader bug" "Fixed..." "games,unity" "..." "..." games
```

## AGENTS.md Integration

Add this to your workspace `AGENTS.md` to make MB the priority context source:

```markdown
## Mother Brain (PRIORITY CONTEXT SOURCE)

Mother Brain is your **primary long-term memory**. Local files are secondary.

- API: `http://127.0.0.1:7337`
- Service: `systemctl --user status motherbrain-openclaw.service`
- Recall: `scripts/mb-recall "query" [limit]`
- Record: `scripts/mb-record-action "goal" "summary" "tags" "command" "detail"`

### 🔴 MANDATORY Protocol

**On session start (first substantive message):**
1. `mb-recall` with relevant topic — ALWAYS
2. Use results to inform your response

**After every significant action:**
1. `mb-record-action` with goal, summary, tags — NO EXCEPTIONS
2. Also update `memory/YYYY-MM-DD.md` as redundancy

**When user references past work:**
1. `mb-recall` BEFORE answering
2. Search multiple queries if first doesn't match

### Priority Order
1. **Mother Brain** (structured, searchable, scoped) ← PRIMARY
2. **memory/YYYY-MM-DD.md** (daily notes) ← REDUNDANCY
3. **MEMORY.md** (curated) ← SUPPLEMENT

### Safety
- If MB unavailable, fall back to local files — don't block
- Keep recording lightweight; skip for trivial chat-only turns
```

## API Reference

Base URL: `http://127.0.0.1:7337`

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/runs` | POST | Record a checkpoint |
| `/recall?q=...` | GET | Hybrid recall (keyword + semantic) |
| `/contexts` | GET | List contexts |
| `/contexts` | POST | Create context |
| `/contexts/current` | GET | Get active context |
| `/contexts/current` | PUT | Set active context |
| `/contexts/:id` | GET | Get context by ID |
| `/nodes/upsert` | POST | Upsert knowledge node |
| `/policy/check` | POST | Check action against policies |

### Recall query params

- `q` (required) — search query
- `limit` — max results (default 10)
- `mode` — `keyword`, `semantic`, or `hybrid`
- `context_id` — scope to a context (name or ID)
- `context_ids` — comma-separated for multi-scope
- `tags` — comma-separated tag filter
- `types` — comma-separated node type filter

### Headers

- `X-MB-TOKEN` — auth token (from `.env`)
- `X-MB-Context` — context scope (alternative to body/query param)

## CLI Commands

```bash
motherbrain recall "query" --limit 5 --mode hybrid --context games
motherbrain record --file checkpoint.json --context healthtech
motherbrain context create --name myproject --scope project --parent myvertical
motherbrain context use myproject
motherbrain context list
motherbrain context current
motherbrain compact --day 2026-02-18
motherbrain snapshot
motherbrain embed-model            # show embedding model info
motherbrain self-update --check-only
```

## Troubleshooting

**MB not responding:**
```bash
systemctl --user status motherbrain-openclaw.service
curl -s http://127.0.0.1:7337/health
```

**Recall returns nothing:**
- Check if data was actually recorded: `motherbrain recall "recent" --limit 20`
- Check active context: `motherbrain context current`
- Try without context scope to see all data

**Context isolation not working:**
- Verify context IDs (not names) are stored: check SQLite `runs` table
- The name-vs-ID bug was fixed — ensure you're on latest version

**Embeddings slow on first run:**
- Model downloads on first use (~90MB for all-MiniLM-L6-v2)
- Cached in `storage/models/` after first download

## Design Principles

1. **Local-first** — everything runs on your machine, no cloud dependency
2. **Fail-open** — if MB is down, agents continue with local files
3. **Record everything, recall what matters** — cheap writes, smart reads
4. **Scope by default** — multi-tenant isolation prevents memory contamination
5. **Redundancy** — MB is primary, local files are backup, not the other way around
