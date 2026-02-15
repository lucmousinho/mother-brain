import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getDbPath } from '../utils/paths.js';

let _db: Database.Database | null = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS runs (
  run_id      TEXT PRIMARY KEY,
  timestamp   TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  goal        TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'success',
  tags_json   TEXT NOT NULL DEFAULT '[]',
  raw_json    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  node_id   TEXT PRIMARY KEY,
  type      TEXT NOT NULL,
  title     TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'active',
  tags_json TEXT NOT NULL DEFAULT '[]',
  raw_md    TEXT NOT NULL DEFAULT '',
  raw_json  TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS links (
  run_id  TEXT NOT NULL,
  node_id TEXT NOT NULL,
  PRIMARY KEY (run_id, node_id)
);

CREATE TABLE IF NOT EXISTS audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp     TEXT NOT NULL,
  action        TEXT NOT NULL,
  allowed       INTEGER NOT NULL DEFAULT 1,
  reason        TEXT NOT NULL DEFAULT '',
  payload_json  TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS contexts (
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

CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs(timestamp);
CREATE INDEX IF NOT EXISTS idx_runs_agent ON runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_links_node ON links(node_id);
CREATE INDEX IF NOT EXISTS idx_contexts_scope ON contexts(scope);
CREATE INDEX IF NOT EXISTS idx_contexts_parent ON contexts(parent_id);
`;

function runMigrations(db: Database.Database): void {
  const now = new Date().toISOString();

  // Add context_id to runs
  try {
    db.exec(`ALTER TABLE runs ADD COLUMN context_id TEXT NOT NULL DEFAULT '__global__'`);
  } catch {
    // Column already exists — safe to ignore
  }

  // Add context_id to nodes
  try {
    db.exec(`ALTER TABLE nodes ADD COLUMN context_id TEXT NOT NULL DEFAULT '__global__'`);
  } catch {
    // Column already exists — safe to ignore
  }

  // Create indexes for context columns
  db.exec(`CREATE INDEX IF NOT EXISTS idx_runs_context ON runs(context_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_context ON nodes(context_id)`);

  // Seed global context
  db.prepare(
    `INSERT OR IGNORE INTO contexts (context_id, name, scope, parent_id, scope_path, created_at, updated_at, metadata_json)
     VALUES ('__global__', 'Global', 'global', NULL, '__global__', ?, ?, '{}')`,
  ).run(now, now);

  // Backfill any rows with empty context_id
  db.exec(`UPDATE runs SET context_id = '__global__' WHERE context_id = ''`);
  db.exec(`UPDATE nodes SET context_id = '__global__' WHERE context_id = ''`);
}

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = getDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(SCHEMA_SQL);
  runMigrations(_db);

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// For testing: allow injecting an in-memory DB
export function getTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  return db;
}
