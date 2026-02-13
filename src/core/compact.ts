import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { RunCheckpoint } from './schemas.js';
import { getCheckpointsDir, getSnapshotsDir } from '../utils/paths.js';
import { getDb } from '../db/database.js';
import { upsertNode } from './tree.js';
import { generateNodeId } from '../utils/ids.js';

export interface CompactResult {
  day: string;
  runs_processed: number;
  patterns_created: string[];
  summary_path: string;
}

export async function compactDay(day: string, db?: Database.Database): Promise<CompactResult> {
  const database = db || getDb();

  // Parse day YYYY-MM-DD
  const [yyyy, mm, dd] = day.split('-');
  if (!yyyy || !mm || !dd) {
    throw new Error(`Invalid day format: ${day}. Expected YYYY-MM-DD`);
  }

  // Find checkpoints for that day
  const dayDir = join(getCheckpointsDir(), yyyy, mm);
  const runs: RunCheckpoint[] = [];

  if (existsSync(dayDir)) {
    const files = readdirSync(dayDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const content = readFileSync(join(dayDir, file), 'utf-8');
      const run = JSON.parse(content) as RunCheckpoint;
      const runDate = new Date(run.timestamp || '').toISOString().slice(0, 10);
      if (runDate === day) {
        runs.push(run);
      }
    }
  }

  // Also query from DB for completeness
  const dbRuns = database
    .prepare(`SELECT raw_json FROM runs WHERE timestamp LIKE ? ORDER BY timestamp`)
    .all(`${day}%`) as { raw_json: string }[];

  for (const row of dbRuns) {
    const run = JSON.parse(row.raw_json) as RunCheckpoint;
    if (!runs.find((r) => r.run_id === run.run_id)) {
      runs.push(run);
    }
  }

  if (runs.length === 0) {
    return {
      day,
      runs_processed: 0,
      patterns_created: [],
      summary_path: '',
    };
  }

  // Analyze patterns
  const agents = new Set(runs.map((r) => r.agent.name));
  const goals = runs.map((r) => r.intent.goal);
  const statuses = runs.map((r) => r.result.status);
  const successRate = statuses.filter((s) => s === 'success').length / statuses.length;
  const allTags = runs.flatMap((r) => r.tags);
  const tagCounts = new Map<string, number>();
  for (const t of allTags) {
    tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);

  const riskFlags = runs.flatMap((r) => r.risk_flags).filter(Boolean);
  const filesChanged = [...new Set(runs.flatMap((r) => r.files_touched))];

  // Create patterns/decisions nodes
  const patternsCreated: string[] = [];

  if (runs.length >= 2) {
    const patternId = generateNodeId('pattern');
    await upsertNode(
      {
        id: patternId,
        type: 'pattern',
        title: `Daily pattern: ${day} (${runs.length} runs)`,
        status: 'active',
        tags: ['daily-compact', ...topTags],
        body: [
          `Agents: ${[...agents].join(', ')}`,
          `Success rate: ${(successRate * 100).toFixed(0)}%`,
          `Common goals: ${goals.slice(0, 5).join('; ')}`,
          riskFlags.length > 0 ? `Risk flags: ${riskFlags.join(', ')}` : '',
          `Files touched: ${filesChanged.slice(0, 10).join(', ')}`,
        ]
          .filter(Boolean)
          .join('\n'),
        refs: {
          runs: runs.map((r) => r.run_id!),
          files: filesChanged.slice(0, 20),
        },
        next_actions: [],
      },
      database,
    );
    patternsCreated.push(patternId);
  }

  // Generate daily summary markdown
  const snapshotsDir = getSnapshotsDir();
  mkdirSync(snapshotsDir, { recursive: true });
  const summaryPath = join(snapshotsDir, `daily_summary_${day}.md`);

  const summary = [
    `# Daily Summary: ${day}\n`,
    `## Overview`,
    `- Runs: ${runs.length}`,
    `- Agents: ${[...agents].join(', ')}`,
    `- Success rate: ${(successRate * 100).toFixed(0)}%`,
    `- Risk flags: ${riskFlags.length}\n`,
    `## Goals`,
    ...goals.map((g) => `- ${g}`),
    '',
    `## Results`,
    ...runs.map(
      (r) => `- **${r.run_id}** [${r.result.status}]: ${r.result.summary}`,
    ),
    '',
    riskFlags.length > 0 ? `## Risk Flags\n${riskFlags.map((f) => `- ${f}`).join('\n')}\n` : '',
    filesChanged.length > 0
      ? `## Files Touched\n${filesChanged.map((f) => `- ${f}`).join('\n')}\n`
      : '',
    topTags.length > 0 ? `## Top Tags\n${topTags.map((t) => `- ${t}`).join('\n')}\n` : '',
  ]
    .filter(Boolean)
    .join('\n');

  writeFileSync(summaryPath, summary, 'utf-8');

  return {
    day,
    runs_processed: runs.length,
    patterns_created: patternsCreated,
    summary_path: summaryPath,
  };
}
