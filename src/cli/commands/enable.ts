import { Command, Flags } from '@oclif/core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { getDataDir, getProjectRoot, isInitialized } from '../../utils/paths.js';

export default class Enable extends Command {
  static override description =
    'Enable repo mode: verifies Git (optional), creates VERSION file.';

  static override examples = ['$ motherbrain enable', '$ motherbrain enable --branch mb-checkpoints'];

  static override flags = {
    branch: Flags.string({
      char: 'b',
      description: 'Optional branch name for checkpoints',
      default: '',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Enable);
    const root = getProjectRoot();

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    // Check for git
    let isGit = false;
    try {
      execSync('git rev-parse --is-inside-work-tree', { cwd: root, stdio: 'pipe' });
      isGit = true;
      this.log('Git repository detected.');
    } catch {
      this.log('Not a git repository (optional, continuing).');
    }

    // Optional branch (use execFileSync to avoid shell injection)
    if (isGit && flags.branch) {
      try {
        execFileSync('git', ['rev-parse', '--verify', flags.branch], { cwd: root, stdio: 'pipe' });
        this.log(`Branch "${flags.branch}" already exists.`);
      } catch {
        this.log(`Branch "${flags.branch}" does not exist. You can create it when needed.`);
      }
    }

    // Write VERSION
    const dataDir = getDataDir();
    mkdirSync(dataDir, { recursive: true });
    const versionFile = join(dataDir, 'VERSION');
    writeFileSync(versionFile, 'v1\n', 'utf-8');
    this.log(`Created ${versionFile}`);

    this.log('\nRepo mode enabled.');
    this.log('Next: motherbrain api start');
  }
}
