import { Command, Flags } from '@oclif/core';
import { isInitialized } from '../../../utils/paths.js';
import { createContext } from '../../../core/context/context.manager.js';
import type { ContextScope } from '../../../core/context/context.types.js';

export default class ContextCreate extends Command {
  static override description = 'Create a new memory context (vertical or project).';

  static override examples = [
    '$ motherbrain context create --name healthcare --scope vertical',
    '$ motherbrain context create --name project-alpha --scope project --parent healthcare',
  ];

  static override flags = {
    name: Flags.string({
      char: 'n',
      description: 'Context name',
      required: true,
    }),
    scope: Flags.string({
      char: 's',
      description: 'Context scope',
      options: ['vertical', 'project'],
      required: true,
    }),
    parent: Flags.string({
      char: 'p',
      description: 'Parent context name or ID (required for project scope)',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ContextCreate);

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    try {
      const context = await createContext({
        name: flags.name,
        scope: flags.scope as Exclude<ContextScope, 'global'>,
        parent_id: flags.parent,
      });
      this.log(JSON.stringify(context, null, 2));
    } catch (err) {
      if (err instanceof Error) {
        this.error(err.message);
      }
      throw err;
    }
  }
}
