import { Command, Args, Flags } from '@oclif/core';
import { isInitialized } from '../../utils/paths.js';
import { recall, formatRecallMarkdown } from '../../core/recall.js';

export default class Recall extends Command {
  static override description =
    'Hybrid recall: search runs and nodes by keyword, tags, and recency.';

  static override examples = [
    '$ motherbrain recall "deploy"',
    '$ motherbrain recall "auth bug" --format md',
    '$ motherbrain recall "refactor" --limit 5 --tags backend',
  ];

  static override args = {
    query: Args.string({
      description: 'Search query',
      required: true,
    }),
  };

  static override flags = {
    format: Flags.string({
      description: 'Output format',
      options: ['json', 'md'],
      default: 'json',
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'Max results per category',
      default: 10,
    }),
    tags: Flags.string({
      description: 'Comma-separated tags to filter by',
    }),
    types: Flags.string({
      description: 'Comma-separated node types to filter by',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Recall);

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    const tags = flags.tags ? flags.tags.split(',').map((t) => t.trim()) : undefined;
    const nodeTypes = flags.types ? flags.types.split(',').map((t) => t.trim()) : undefined;

    const result = recall(args.query, flags.limit, tags, nodeTypes);

    if (flags.format === 'md') {
      this.log(formatRecallMarkdown(result));
    } else {
      this.log(JSON.stringify(result, null, 2));
    }
  }
}
