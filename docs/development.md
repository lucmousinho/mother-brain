# Development

## Install from source

```bash
git clone https://github.com/lucmousinho/mother-brain.git && cd mother-brain
pnpm install
pnpm build
node --no-warnings bin/run.js --help
```

## Scripts

```bash
# Run CLI in dev mode (no build needed)
pnpm dev init
pnpm dev setup --with-token
pnpm dev record --file examples/example_run_checkpoint.json

# Build
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Format
pnpm format
```

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
    vector/                   # LanceDB vector store
    models/                   # Cached embedding model weights
  policies/                   # Allow/deny policy files
  src/
    cli/commands/             # oclif CLI commands
    api/                      # Fastify API server + routes
    core/                     # Business logic
      context/                # Hierarchical context system
      scope/                  # Scope filtering utilities
      embeddings/             # Local embedding model
      vectorstore/            # LanceDB vector store
    db/                       # SQLite database layer
    adapters/openclaw/        # OpenClaw adapter
    utils/                    # Utilities (paths, IDs, filelock, markdown)
  scripts/                    # Build and packaging scripts
  templates/                  # Templates for nodes and checkpoints
  examples/                   # Example JSON files
  tests/                      # Vitest tests
```

## Key Architectural Decisions

1. **Append-Only Checkpoints** — JSON files never modified after creation (audit trail)
2. **Dual Storage** — Files (git-friendly) + SQLite (fast queries)
3. **Non-Blocking Indexing** — Vector indexing never blocks checkpoint recording
4. **Fallback to Keyword** — Semantic/hybrid recall gracefully falls back to keyword
5. **Local-First** — 100% offline after first embedding model download
6. **Simple Policy** — Denylist > allowlist > default allow
7. **Lazy Initialization** — Vector store and embedding model loaded on-demand
8. **Stateless API** — All data in files/DB, API can be restarted anytime
9. **File Locking** — Simple lock files for concurrent access protection
10. **ESM Modules** — Native ES modules throughout (Node 20+)
11. **Hierarchical Contexts** — 3-level scoped memory (Global / Vertical / Project) with inheritance
