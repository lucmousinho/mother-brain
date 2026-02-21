import { Command, Flags } from '@oclif/core';
import { getDb } from '../../db/database.js';
import type { GotchaNode } from '../../core/schemas.js';

export default class ListGotchas extends Command {
  static summary = 'List gotchas (known pitfalls)';

  static description = `
List gotchas from the knowledge tree, optionally filtered by severity or category.

Examples:
  motherbrain list-gotchas
  motherbrain list-gotchas --severity high
  motherbrain list-gotchas --severity critical
  motherbrain list-gotchas --category security
  motherbrain list-gotchas --limit 5
  `;

  static args = {};

  static flags = {
    severity: Flags.string({
      description: 'Filter by severity (low, medium, high, critical)',
      options: ['low', 'medium', 'high', 'critical'] as const,
    }),
    category: Flags.string({
      description: 'Filter by tag/category',
    }),
    limit: Flags.integer({
      description: 'Maximum number of results',
      default: 20,
    }),
    context: Flags.string({
      description: 'Filter by context ID',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ListGotchas);
    const db = getDb();

    let sql = `SELECT raw_json FROM nodes WHERE type = 'gotcha'`;
    const params: unknown[] = [];

    if (flags.context) {
      sql += ` AND context_id = ?`;
      params.push(flags.context);
    }

    // No ORDER BY here since updated_at is not a column, we'll sort in-memory
    const rows = db.prepare(sql).all(...params) as { raw_json: string }[];

    let gotchas = rows.map((r) => JSON.parse(r.raw_json) as GotchaNode);

    // Sort by updated_at from JSON (most recent first)
    gotchas.sort((a, b) => {
      const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return dateB - dateA; // Descending
    });

    // Filter by severity if specified
    if (flags.severity) {
      gotchas = gotchas.filter((g) => g.severity === flags.severity);
    }

    // Filter by category (tag) if specified
    if (flags.category) {
      gotchas = gotchas.filter((g) => g.tags.includes(flags.category!));
    }

    // Apply limit after filtering
    gotchas = gotchas.slice(0, flags.limit);

    if (gotchas.length === 0) {
      this.log('No gotchas found matching criteria.');
      return;
    }

    this.log(`\n📌 Found ${gotchas.length} gotcha(s):\n`);

    for (const gotcha of gotchas) {
      const severityEmoji = {
        low: '🟢',
        medium: '🟡',
        high: '🟠',
        critical: '🔴',
      }[gotcha.severity];

      this.log(`${severityEmoji} ${gotcha.title}`);
      this.log(`   ID: ${gotcha.id}`);
      this.log(`   Severity: ${gotcha.severity}`);
      this.log(`   Solution: ${gotcha.solution}`);

      if (gotcha.tags.length > 0) {
        this.log(`   Tags: ${gotcha.tags.join(', ')}`);
      }

      if (gotcha.occurrences > 1) {
        this.log(`   Occurrences: ${gotcha.occurrences}`);
      }

      if (gotcha.last_seen) {
        this.log(`   Last seen: ${gotcha.last_seen}`);
      }

      this.log('');
    }
  }
}
