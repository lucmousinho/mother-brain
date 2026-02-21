import { Command, Flags } from '@oclif/core';
import { upsertNode } from '../../core/tree.js';
import { generateNodeId } from '../../utils/ids.js';
import type { InsightNode } from '../../core/schemas.js';

export default class AddInsight extends Command {
  static summary = 'Add an insight node (discovery during development/execution)';

  static description = `
Add an insight to the knowledge tree.
Insights capture discoveries made during development or execution.

Examples:
  motherbrain add-insight --title "LanceDB requires parameterized queries" \\
    --category security \\
    --body "Raw string interpolation in filters causes SQL injection. Always use sanitizeFilterValue()."

  motherbrain add-insight --title "TypeScript inference improves with explicit returns" \\
    --category architecture \\
    --severity high
  `;

  static args = {};

  static flags = {
    title: Flags.string({
      description: 'Insight title (what was discovered)',
      required: true,
    }),
    body: Flags.string({
      description: 'Detailed description of the insight',
      default: '',
    }),
    category: Flags.string({
      description: 'Category (e.g., architecture, performance, security)',
    }),
    severity: Flags.string({
      description: 'Severity level (low, medium, high)',
      default: 'medium',
      options: ['low', 'medium', 'high'] as const,
    }),
    tags: Flags.string({
      description: 'Comma-separated tags',
    }),
    context: Flags.string({
      description: 'Context ID to associate with',
    }),
    'link-runs': Flags.string({
      description: 'Comma-separated run IDs to link',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AddInsight);

    const nodeId = generateNodeId('insight');
    const tags = flags.tags ? flags.tags.split(',').map((t) => t.trim()) : [];
    const linkRuns = flags['link-runs']
      ? flags['link-runs'].split(',').map((r) => r.trim())
      : [];

    const insight: Partial<InsightNode> = {
      id: nodeId,
      type: 'insight',
      title: flags.title,
      body: flags.body,
      status: 'active',
      tags,
      category: flags.category,
      severity: flags.severity as 'low' | 'medium' | 'high',
      discovered_at: new Date().toISOString(),
      refs: {
        runs: linkRuns,
        files: [],
      },
      next_actions: [],
    };

    const result = await upsertNode(insight, undefined, flags.context);

    this.log(`✅ Insight created: ${result.node_id}`);
    this.log(`   Title: ${flags.title}`);
    if (flags.category) this.log(`   Category: ${flags.category}`);
    this.log(`   Severity: ${flags.severity}`);
    if (tags.length > 0) this.log(`   Tags: ${tags.join(', ')}`);
  }
}
