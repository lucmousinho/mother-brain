import { Command, Flags } from '@oclif/core';
import { upsertNode } from '../../core/tree.js';
import { generateNodeId } from '../../utils/ids.js';
import type { GotchaNode } from '../../core/schemas.js';

export default class AddGotcha extends Command {
  static summary = 'Add a gotcha node (known pitfall with solution)';

  static description = `
Add a gotcha to the knowledge tree.
Gotchas capture known pitfalls with documented solutions.

Examples:
  motherbrain add-gotcha \\
    --title "snapshot.ts ignores scope" \\
    --severity critical \\
    --solution "Add context_id filter to query" \\
    --body "The snapshot function was querying ALL nodes without filtering by context, causing data leaks."

  motherbrain add-gotcha \\
    --title "Promise.all fails fast" \\
    --severity medium \\
    --solution "Use Promise.allSettled() for independent async operations"
  `;

  static args = {};

  static flags = {
    title: Flags.string({
      description: 'Gotcha title (what the pitfall is)',
      required: true,
    }),
    solution: Flags.string({
      description: 'How to avoid/fix this gotcha',
      required: true,
    }),
    body: Flags.string({
      description: 'Detailed description of the gotcha',
      default: '',
    }),
    severity: Flags.string({
      description: 'Severity level (low, medium, high, critical)',
      required: true,
      options: ['low', 'medium', 'high', 'critical'] as const,
    }),
    tags: Flags.string({
      description: 'Comma-separated tags',
    }),
    context: Flags.string({
      description: 'Context ID to associate with',
    }),
    'link-runs': Flags.string({
      description: 'Comma-separated run IDs where gotcha occurred',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AddGotcha);

    const nodeId = generateNodeId('gotcha');
    const tags = flags.tags ? flags.tags.split(',').map((t) => t.trim()) : [];
    const linkRuns = flags['link-runs']
      ? flags['link-runs'].split(',').map((r) => r.trim())
      : [];

    const gotcha: Partial<GotchaNode> = {
      id: nodeId,
      type: 'gotcha',
      title: flags.title,
      body: flags.body,
      status: 'active',
      tags,
      severity: flags.severity as 'low' | 'medium' | 'high' | 'critical',
      solution: flags.solution,
      occurrences: 1,
      last_seen: new Date().toISOString(),
      refs: {
        runs: linkRuns,
        files: [],
      },
      next_actions: [],
    };

    const result = await upsertNode(gotcha, undefined, flags.context);

    this.log(`✅ Gotcha created: ${result.node_id}`);
    this.log(`   Title: ${flags.title}`);
    this.log(`   Severity: ${flags.severity}`);
    this.log(`   Solution: ${flags.solution}`);
    if (tags.length > 0) this.log(`   Tags: ${tags.join(', ')}`);
  }
}
