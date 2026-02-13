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

CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs(timestamp);
CREATE INDEX IF NOT EXISTS idx_runs_agent ON runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_links_node ON links(node_id);
`;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = getDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(SCHEMA_SQL);

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
  return db;
}
