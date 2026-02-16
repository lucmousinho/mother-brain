# Configuration

The quickest way to configure Mother Brain is via the setup command:

```bash
motherbrain setup --with-token --port 7337
```

This creates `.env` from `.env.example` with your chosen options. To configure manually:

```bash
cp .env.example .env
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MB_TOKEN` | _(empty)_ | API auth token (header `X-MB-TOKEN`) |
| `MB_API_PORT` | `7337` | API port |
| `MB_DATA_DIR` | `./motherbrain` | Versioned data directory |
| `MB_STORAGE_DIR` | `./storage` | Local state directory |
| `MB_EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | Local embedding model |
| `MB_RECALL_MODE` | `keyword` | Default recall mode (`keyword` / `semantic` / `hybrid`) |
| `MB_VECTOR_PATH` | `./storage/vector` | LanceDB vector store path |
| `MB_VECTOR_TOP_K` | `10` | Default top-K for vector search |
| `MB_MODEL_CACHE_DIR` | `./storage/models` | Model weights cache directory |

### OpenClaw Integration

These variables are read by `OpenClawHooks.fromEnv()`. See [OpenClaw Integration](./openclaw-integration.md) for full details.

| Variable | Default | Description |
|----------|---------|-------------|
| `MB_URL` | `http://127.0.0.1:7337` | Mother Brain API base URL (client-side) |
| `MB_TIMEOUT_MS` | `5000` | Per-request timeout in milliseconds |
| `MB_HEALTH_CACHE_MS` | `30000` | How long a health probe result is cached |
| `MB_ON_UNAVAILABLE` | `skip` | Behavior when MB is down: `skip` / `warn` / `throw` |
| `MB_AGENT_ID` | `openclaw` | Default agent ID in checkpoints |
| `MB_AGENT_NAME` | `OpenClaw Agent` | Default agent display name |
| `MB_CONTEXT_ID` | _(empty)_ | Scoped-memory context ID |

## Semantic Recall (Offline)

Mother Brain supports **100% offline semantic search** using local embeddings. No external APIs, no cloud services.

### How it works

1. Text from checkpoints and nodes is converted to dense vectors using a local transformer model (`Xenova/all-MiniLM-L6-v2`, 384 dimensions)
2. Vectors are stored in a local LanceDB database (`storage/vector/`)
3. Recall queries are embedded and compared via cosine similarity
4. Results include a `similarity_score` (0-1) alongside traditional keyword scores

### Recall Modes

| Mode | Description |
|------|-------------|
| `keyword` | Original keyword + tag + recency scoring (default) |
| `semantic` | Vector similarity search only |
| `hybrid` | Combines keyword and vector scores for best results |

Set the default mode via `MB_RECALL_MODE` in `.env`, or pass `--mode` per query.

### Embedding Model

- **Default:** `Xenova/all-MiniLM-L6-v2` (31 MB, 384 dimensions)
- **Override:** Set `MB_EMBEDDING_MODEL` in `.env`
- **Cache:** Models are downloaded on first use to `storage/models/` (override with `MB_MODEL_CACHE_DIR`)
- **Offline:** After the first download, everything works without internet

### Warmup

Pre-download the model so the first recall is fast:

```bash
motherbrain embed-model warmup
```

### Performance Notes

- First embedding takes 2-5s (model loading + ONNX session init)
- Subsequent embeddings: ~10-50ms per text
- Embedding cache avoids recomputing identical texts
- Vector indexing is non-blocking — never slows down `record` or `upsert-node`
- If the model is not loaded, semantic/hybrid mode falls back to keyword automatically

### Offline Guarantee

After running `embed-model warmup` once, Mother Brain is fully offline:
- No external API calls
- No network required
- Model weights cached locally
- Vector store is a local directory
