# Concepts

## Recall Modes

Mother Brain offers three recall modes that can be used via CLI (`--mode`) or API (`?mode=`).

### Keyword

The original recall engine. Scores results by:

- **Keyword matching** — each keyword found in goal/summary/title adds +2 points
- **ID matching** — keyword found in run_id/node_id adds +3 points
- **Tag matching** — each matching tag adds +3 points
- **Recency boost** — last 24h: +2, last week: +1
- **Active status** — active nodes get +1

Best for: exact term searches, tag-based filtering, when you know the terminology.

### Semantic

Vector similarity search using local embeddings. The query is embedded into a dense vector and compared against all indexed documents using cosine similarity.

- No keyword matching — understands meaning, not just words
- Returns a `similarity_score` from 0 to 1
- Works across synonyms and paraphrases

Best for: natural language queries like "how did we handle the deployment failure last week".

### Hybrid

Combines keyword and semantic results. Algorithm:

1. Run keyword search (2x limit)
2. Run vector search (2x limit)
3. For documents found by both: combine scores (keyword score + similarity * 10)
4. For documents found by only one method: use that score alone
5. Sort by combined score, return top N

Best for: general use — gets the precision of keywords plus the recall of semantic search.

## Fallback Behaviour

- If the embedding model is not loaded → falls back to keyword
- If the vector store fails → falls back to keyword
- Keyword mode never fails (it only depends on SQLite)

## How Mother Brain Becomes Multi-Agent Vector Memory

```
Agent A                  Agent B                  Agent C
   |                        |                        |
   +-- record checkpoint    +-- record checkpoint    +-- record checkpoint
   |   (auto-embeds)        |   (auto-embeds)        |   (auto-embeds)
   |                        |                        |
   +-- recall (hybrid) <----+-- recall (semantic) <--+-- recall (keyword)
   |                        |                        |
   v                        v                        v
         Shared Vector Store (LanceDB) + SQLite
```

Every agent that records checkpoints or upserts nodes automatically indexes them in the vector store. Every agent that calls recall can search across all agents' knowledge — keyword, semantic, or hybrid.

The vector store is local (a directory on disk), so multiple agents can share it by pointing at the same project directory. File-level locking prevents concurrent write corruption.

## Embedding Pipeline

```
Text → Tokenize → ONNX Runtime → 384-dim vector → Normalize → LanceDB
```

1. **Text assembly:** For runs, the text is `goal + summary + context + actions`. For nodes, it's `title + tags + next_actions + body`.
2. **Tokenization:** The Xenova/transformers library tokenizes the text into input IDs.
3. **Inference:** The ONNX model (`all-MiniLM-L6-v2`) runs locally — no network needed after first download.
4. **Pooling:** Mean pooling over all token embeddings produces a single 384-dimensional vector.
5. **Normalization:** The vector is L2-normalized so cosine similarity = dot product.
6. **Storage:** The vector + metadata are stored in LanceDB (columnar format on disk).

## Model Cache

Models are downloaded on first use to `storage/models/` (or `MB_MODEL_CACHE_DIR`). The download is ~31 MB for `all-MiniLM-L6-v2`. After download, the model loads from disk in ~1-2 seconds.

To pre-download:

```bash
motherbrain embed-model warmup
```
