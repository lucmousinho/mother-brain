import { Command, Flags } from '@oclif/core';
import { readFileSync } from 'node:fs';
import { isInitialized } from '../../utils/paths.js';
import { upsertNode } from '../../core/tree.js';

export default class UpsertNode extends Command {
  static override description =
    'Create or update a knowledge tree node (project/goal/task/decision/pattern/constraint/playbook/agent).';

  static override examples = [
    '$ motherbrain upsert-node --file examples/example_node_task.json',
    '$ motherbrain upsert-node --id task_001 --type task --title "Deploy staging" --status active --tags deploy,staging',
  ];

  static override flags = {
    file: Flags.string({
      char: 'f',
      description: 'Path to node JSON file',
    }),
    id: Flags.string({ description: 'Node ID' }),
    type: Flags.string({
      char: 't',
      description: 'Node type',
      options: ['project', 'goal', 'task', 'decision', 'pattern', 'constraint', 'playbook', 'agent'],
    }),
    title: Flags.string({ description: 'Node title' }),
    status: Flags.string({
      char: 's',
      description: 'Node status',
      options: ['active', 'done', 'archived', 'blocked', 'draft'],
    }),
    tags: Flags.string({ description: 'Comma-separated tags' }),
    body: Flags.string({ description: 'Node body text' }),
    context: Flags.string({
      char: 'c',
      description: 'Context ID or name for scoped node',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(UpsertNode);

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    let data: Record<string, unknown>;

    if (flags.file) {
      const content = readFileSync(flags.file, 'utf-8');
      data = JSON.parse(content);
    } else {
      if (!flags.id || !flags.type || !flags.title) {
        this.error('When not using --file, --id, --type, and --title are required.');
      }
      data = {
        id: flags.id,
        type: flags.type,
        title: flags.title,
        status: flags.status || 'active',
        tags: flags.tags ? flags.tags.split(',').map((t) => t.trim()) : [],
        body: flags.body || '',
      };
    }

    try {
      const result = await upsertNode(data, undefined, flags.context);
      this.log(JSON.stringify(result, null, 2));
    } catch (err) {
      if (err instanceof Error) {
        this.error(`Upsert failed: ${err.message}`);
      }
      throw err;
    }
  }
}
