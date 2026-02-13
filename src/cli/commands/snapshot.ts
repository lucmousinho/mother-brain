import { Command } from '@oclif/core';
import { isInitialized } from '../../utils/paths.js';
import { generateSnapshot } from '../../core/snapshot.js';

export default class Snapshot extends Command {
  static override description =
    'Generate materialized snapshots: current_context.md and active_tasks.json.';

  static override examples = ['$ motherbrain snapshot'];

  async run(): Promise<void> {
    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    const result = generateSnapshot();

    this.log('Snapshot generated:');
    this.log(`  Context:  ${result.context_path}`);
    this.log(`  Tasks:    ${result.tasks_path}`);
    this.log(`  Nodes:    ${result.total_nodes}`);
    this.log(`  Runs:     ${result.total_runs}`);
    this.log(`  Active tasks: ${result.active_tasks}`);
  }
}
