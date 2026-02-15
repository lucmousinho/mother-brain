import { Command, Args } from '@oclif/core';
import { isInitialized } from '../../../utils/paths.js';
import { setActiveContext, clearActiveContext } from '../../../core/context/context.resolver.js';
import { GLOBAL_CONTEXT_ID } from '../../../core/context/context.types.js';

export default class ContextUse extends Command {
  static override description = 'Set the active memory context by name or ID.';

  static override examples = [
    '$ motherbrain context use drclick',
    '$ motherbrain context use __global__',
  ];

  static override args = {
    context: Args.string({
      description: 'Context name or ID',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ContextUse);

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    try {
      if (args.context === GLOBAL_CONTEXT_ID) {
        clearActiveContext();
        this.log('Active context cleared (using global).');
        return;
      }

      const info = await setActiveContext(args.context);
      this.log(`Active context set to: ${info.name} (${info.context_id})`);
      this.log(`Scope: ${info.scope}`);
      this.log(`Path: ${info.scope_path}`);
    } catch (err) {
      if (err instanceof Error) {
        this.error(err.message);
      }
      throw err;
    }
  }
}
