import { Command, Flags } from '@oclif/core';
import { isInitialized } from '../../../utils/paths.js';
import { listContexts } from '../../../core/context/context.manager.js';
import type { ContextScope, MemoryContext } from '../../../core/context/context.types.js';

export default class ContextList extends Command {
  static override description = 'List all memory contexts.';

  static override examples = [
    '$ motherbrain context list',
    '$ motherbrain context list --scope vertical',
    '$ motherbrain context list --format tree',
  ];

  static override flags = {
    scope: Flags.string({
      char: 's',
      description: 'Filter by scope',
      options: ['global', 'vertical', 'project'],
    }),
    parent: Flags.string({
      char: 'p',
      description: 'Filter by parent context ID',
    }),
    format: Flags.string({
      char: 'f',
      description: 'Output format',
      options: ['json', 'tree'],
      default: 'json',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ContextList);

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    const contexts = listContexts(
      flags.scope as ContextScope | undefined,
      flags.parent,
    );

    if (flags.format === 'tree') {
      this.printTree(contexts);
    } else {
      this.log(JSON.stringify(contexts, null, 2));
    }
  }

  private printTree(contexts: MemoryContext[]): void {
    const global = contexts.find((c) => c.scope === 'global');
    const verticals = contexts.filter((c) => c.scope === 'vertical');
    const projects = contexts.filter((c) => c.scope === 'project');

    if (global) {
      this.log(`GLOBAL (${global.context_id})`);
    } else {
      this.log('GLOBAL (__global__)');
    }

    for (let i = 0; i < verticals.length; i++) {
      const v = verticals[i];
      const isLastVertical = i === verticals.length - 1;
      const prefix = isLastVertical ? '└── ' : '├── ';
      this.log(`  ${prefix}${v.name} (${v.context_id})`);

      const childProjects = projects.filter((p) => p.parent_id === v.context_id);
      for (let j = 0; j < childProjects.length; j++) {
        const p = childProjects[j];
        const isLastProject = j === childProjects.length - 1;
        const childPrefix = isLastProject ? '└── ' : '├── ';
        const indent = isLastVertical ? '      ' : '  │   ';
        this.log(`${indent}${childPrefix}${p.name} (${p.context_id})`);
      }
    }

    if (verticals.length === 0) {
      this.log('  (no verticals)');
    }
  }
}
