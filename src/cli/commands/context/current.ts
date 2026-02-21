import { Command } from '@oclif/core';
import { isInitialized } from '../../../utils/paths.js';
import { getActiveContext, getAncestorChain } from '../../../core/context/context.resolver.js';
import { getContext } from '../../../core/context/context.manager.js';

export default class ContextCurrent extends Command {
  static override description = 'Show the current active memory context and its inheritance chain.';

  static override examples = ['$ motherbrain context current'];

  async run(): Promise<void> {
    await this.parse(ContextCurrent);

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    const active = getActiveContext();

    if (!active) {
      this.log('Active context: Global (__global__)');
      this.log('No explicit context set. All operations use global scope.');
      return;
    }

    this.log(`Active context: ${active.name} (${active.context_id})`);
    this.log(`Scope: ${active.scope}`);
    this.log(`Path: ${active.scope_path}`);
    this.log(`Set at: ${active.set_at}`);

    // Show inheritance chain
    const chain = getAncestorChain(active.context_id);
    if (chain.length > 1) {
      this.log('\nInheritance chain:');
      for (const id of chain) {
        const ctx = getContext(id);
        const name = ctx?.name ?? id;
        const scope = ctx?.scope ?? 'unknown';
        this.log(`  ${scope === 'global' ? 'GLOBAL' : scope.toUpperCase()}: ${name} (${id})`);
      }
    }
  }
}
