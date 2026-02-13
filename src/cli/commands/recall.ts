import { Command, Args, Flags } from '@oclif/core';
import { isInitialized } from '../../utils/paths.js';
import { recall, formatRecallMarkdown, type RecallMode } from '../../core/recall.js';

export default class Recall extends Command {
  static override description =
    'Hybrid recall: search runs and nodes by keyword, semantic similarity, or both.';

  static override examples = [
    '$ motherbrain recall "deploy"',
    '$ motherbrain recall "auth bug" --format md',
    '$ motherbrain recall "refactor" --limit 5 --tags backend',
    '$ motherbrain recall "deploy staging" --mode semantic',
    '$ motherbrain recall "auth" --mode hybrid',
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
    mode: Flags.string({
      char: 'm',
      description: 'Recall mode',
      options: ['keyword', 'semantic', 'hybrid'],
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Recall);

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    const tags = flags.tags ? flags.tags.split(',').map((t) => t.trim()) : undefined;
    const nodeTypes = flags.types ? flags.types.split(',').map((t) => t.trim()) : undefined;
    const mode = (flags.mode as RecallMode) ?? undefined;

    const result = await recall(args.query, flags.limit, tags, nodeTypes, undefined, mode);

    if (flags.format === 'md') {
      this.log(formatRecallMarkdown(result));
    } else {
      this.log(JSON.stringify(result, null, 2));
    }
  }
}
