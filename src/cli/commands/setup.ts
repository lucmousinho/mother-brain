import { Command, Flags } from '@oclif/core';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { initProject } from '../../core/init.js';
import {
  getProjectRoot,
  getDataDir,
  getStorageDir,
  getPoliciesDir,
} from '../../utils/paths.js';

export default class Setup extends Command {
  static override description =
    'Initialize project, configure .env, enable repo mode — one command to get started.';

  static override examples = [
    '$ motherbrain setup',
    '$ motherbrain setup --with-token',
    '$ motherbrain setup --with-token --port 8080',
    '$ motherbrain setup --force',
  ];

  static override flags = {
    'with-token': Flags.boolean({
      char: 't',
      description: 'Generate a random MB_TOKEN in .env',
      default: false,
    }),
    port: Flags.integer({
      char: 'p',
      description: 'Set MB_API_PORT in .env',
      default: 7337,
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Overwrite existing .env file',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Setup);
    const root = getProjectRoot();

    this.log('Mother Brain Setup\n');

    // ── Phase 1: Init ──────────────────────────────────────────────
    this.log('1/4  Initializing project structure...');
    const created = initProject(root);
    if (created.length === 0) {
      this.log('     Already initialized — all directories and files exist.');
    } else {
      this.log(`     Created ${created.length} items.`);
    }

    // ── Phase 2: Configure .env ────────────────────────────────────
    this.log('\n2/4  Configuring .env...');
    const envPath = join(root, '.env');
    const examplePath = join(root, '.env.example');

    if (existsSync(envPath) && !flags.force) {
      this.log('     .env already exists (use --force to overwrite).');
    } else {
      if (!existsSync(examplePath)) {
        this.warn('.env.example not found — creating .env from defaults.');
      }

      // Start from .env.example or sensible defaults
      let envContent = existsSync(examplePath)
        ? readFileSync(examplePath, 'utf-8')
        : 'MB_TOKEN=\nMB_API_PORT=7337\nMB_DATA_DIR=./motherbrain\nMB_STORAGE_DIR=./storage\n';

      // Apply --with-token
      if (flags['with-token']) {
        const token = randomBytes(32).toString('hex');
        envContent = envContent.replace(/^MB_TOKEN=.*$/m, `MB_TOKEN=${token}`);
        this.log(`     Generated MB_TOKEN (${token.slice(0, 8)}...).`);
      }

      // Apply --port
      if (flags.port !== 7337) {
        envContent = envContent.replace(
          /^MB_API_PORT=.*$/m,
          `MB_API_PORT=${flags.port}`,
        );
      }

      writeFileSync(envPath, envContent, 'utf-8');
      this.log(`     Wrote ${envPath}`);
    }

    // ── Phase 3: Enable repo mode ──────────────────────────────────
    this.log('\n3/4  Enabling repo mode...');
    const dataDir = getDataDir();
    const versionFile = join(dataDir, 'VERSION');

    if (existsSync(versionFile)) {
      this.log('     VERSION file already exists.');
    } else {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(versionFile, 'v1\n', 'utf-8');
      this.log(`     Created ${versionFile}`);
    }

    // Detect git
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: root,
        stdio: 'pipe',
      });
      // Git repository detected
      this.log('     Git repository detected.');
    } catch {
      this.log('     Not a git repository (optional).');
    }

    // ── Phase 4: Validate ──────────────────────────────────────────
    this.log('\n4/4  Validating...');
    const checks: [string, string][] = [
      ['Data dir', getDataDir()],
      ['Storage dir', getStorageDir()],
      ['Policies dir', getPoliciesDir()],
      ['.env', envPath],
      ['VERSION', versionFile],
    ];

    let allOk = true;
    for (const [label, path] of checks) {
      const ok = existsSync(path);
      this.log(`     ${ok ? 'OK' : 'MISSING'}  ${label}`);
      if (!ok) allOk = false;
    }

    // ── Summary ────────────────────────────────────────────────────
    this.log('\n' + '─'.repeat(48));
    if (allOk) {
      this.log('Setup complete. Everything looks good.\n');
    } else {
      this.log('Setup finished with warnings — check MISSING items above.\n');
    }

    this.log('Next steps:');
    this.log('  motherbrain api start       # start the local API');
    this.log('  curl http://127.0.0.1:7337/health');
  }
}
