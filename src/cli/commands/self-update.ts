import { Command, Flags } from '@oclif/core';
import { createInterface } from 'node:readline';

export default class SelfUpdate extends Command {
  static override description =
    'Update Mother Brain CLI to the latest version from GitHub Releases.';

  static override examples = [
    '$ motherbrain self-update',
    '$ motherbrain self-update --check-only',
    '$ motherbrain self-update --yes',
    '$ motherbrain self-update --version v0.3.0',
  ];

  static override flags = {
    yes: Flags.boolean({
      char: 'y',
      description: 'Skip confirmation prompt',
      default: false,
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Force update even if checksum cannot be verified',
      default: false,
    }),
    'check-only': Flags.boolean({
      description: 'Only check for updates, do not install',
      default: false,
    }),
    version: Flags.string({
      char: 'v',
      description: 'Update to a specific version tag (e.g. v0.2.0)',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SelfUpdate);

    const { checkForUpdate, performUpdate } = await import(
      '../../core/update/updater.js'
    );

    const currentVersion = this.config.version;

    // ── Check ────────────────────────────────────────────────────
    this.log('Checking for updates...\n');

    let check;
    try {
      check = await checkForUpdate(currentVersion, flags.version);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(`Failed to check for updates: ${msg}`);
    }

    this.log(`  Current:  ${check.currentVersion}`);
    this.log(`  Latest:   ${check.latestVersion}`);
    this.log(`  Platform: ${check.platform.os}-${check.platform.arch}`);

    if (!check.install.isBundleInstall) {
      this.log('');
      this.log('Self-update is only available for bundle installations (via install.sh).');
      this.log('For source installs, use: git pull && pnpm install && pnpm build');
      return;
    }

    if (!check.updateAvailable && !flags.force) {
      this.log('\nAlready up to date.');
      return;
    }

    if (check.updateAvailable) {
      this.log('\n  Update available!');
    } else {
      this.log('\n  Same version (--force specified).');
    }

    if (flags['check-only']) {
      this.log(`\n  Release: ${check.releaseUrl}`);
      return;
    }

    // ── Confirm ──────────────────────────────────────────────────
    if (!flags.yes) {
      const targetVersion = flags.version ?? check.latestVersion;
      const answer = await this.promptConfirm(
        `Update to ${targetVersion}? [y/N] `,
      );
      if (!answer) {
        this.log('Update cancelled.');
        return;
      }
    }

    // ── Update ───────────────────────────────────────────────────
    this.log('');
    const targetTag = flags.version ?? check.latestVersion;

    try {
      const result = await performUpdate(
        currentVersion,
        targetTag,
        flags.force,
        (msg: string) => this.log(`  ${msg}`),
      );

      this.log('');
      this.log('Update complete!');
      this.log(`  ${result.previousVersion} -> ${result.newVersion}`);
      this.log(`  Backup: ${result.backupPath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(`Update failed: ${msg}`);
    }
  }

  private async promptConfirm(message: string): Promise<boolean> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }
}
