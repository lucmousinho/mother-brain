import { Command } from '@oclif/core';
import { initProject } from '../../core/init.js';
import { getProjectRoot } from '../../utils/paths.js';

export default class Init extends Command {
  static override description =
    'Initialize Mother Brain: creates folder structure, default policies, and storage.';

  static override examples = ['$ motherbrain init'];

  async run(): Promise<void> {
    this.log('Initializing Mother Brain...\n');

    const root = getProjectRoot();
    const created = initProject(root);

    if (created.length === 0) {
      this.log('Already initialized. All directories and files exist.');
    } else {
      this.log(`Created ${created.length} items:`);
      for (const item of created) {
        this.log(`  + ${item.replace(root + '/', '')}`);
      }
    }

    this.log('\nMother Brain initialized successfully.');
    this.log('Next steps:');
    this.log('  motherbrain enable     # activate repo mode');
    this.log('  motherbrain api start  # start local API');
  }
}
