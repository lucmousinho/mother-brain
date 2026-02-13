import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  getDataDir,
  getStorageDir,
  getCheckpointsDir,
  getTreeDir,
  getLinksDir,
  getSnapshotsDir,
  getLocksDir,
  getPoliciesDir,
} from '../utils/paths.js';

const NODE_TYPES = [
  'projects',
  'goals',
  'tasks',
  'decisions',
  'patterns',
  'constraints',
  'playbooks',
  'agents',
];

const DEFAULT_DENYLIST_COMMANDS = `# Dangerous commands - deny by default
rm -rf /
rm -rf /*
mkfs*
dd if=*
curl * | bash
wget * | bash
:(){ :|:& };:
chmod -R 777 /
chown -R * /
> /dev/sda
shutdown*
reboot*
init 0
kill -9 -1
`;

const DEFAULT_DENYLIST_PATHS = `# Sensitive paths - deny by default
/
/etc/passwd
/etc/shadow
~/.ssh
~/.ssh/*
~/.pgpass
~/.aws/credentials
~/.config/gcloud
/proc
/sys
`;

const DEFAULT_ALLOWLIST_HOSTS = `# Allowed hosts (empty = allow all)
# Add hosts here to restrict outbound connections
`;

const DEFAULT_DENYLIST_HOSTS = `# Denied hosts
# Add hosts here to block outbound connections
`;

const DEFAULT_ALLOWLIST_COMMANDS = `# Allowed commands (empty = allow all by default, only denylist applies)
# Add patterns here to restrict to only these commands
`;

const DEFAULT_ALLOWLIST_PATHS = `# Allowed paths (empty = allow all by default, only denylist applies)
# Add patterns here to restrict to only these paths
`;

export function initProject(_baseDir: string): string[] {
  const created: string[] = [];

  // Data directories
  const dirs = [
    getDataDir(),
    getCheckpointsDir(),
    ...NODE_TYPES.map((t) => join(getTreeDir(), t)),
    getLinksDir(),
    getSnapshotsDir(),
    getStorageDir(),
    getLocksDir(),
    getPoliciesDir(),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }

  // Policy files
  const policyFiles: [string, string][] = [
    ['denylist.commands.txt', DEFAULT_DENYLIST_COMMANDS],
    ['denylist.paths.txt', DEFAULT_DENYLIST_PATHS],
    ['allowlist.commands.txt', DEFAULT_ALLOWLIST_COMMANDS],
    ['allowlist.paths.txt', DEFAULT_ALLOWLIST_PATHS],
    ['allowlist.hosts.txt', DEFAULT_ALLOWLIST_HOSTS],
    ['denylist.hosts.txt', DEFAULT_DENYLIST_HOSTS],
  ];

  const policiesDir = getPoliciesDir();
  for (const [filename, content] of policyFiles) {
    const filePath = join(policiesDir, filename);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, content, 'utf-8');
      created.push(filePath);
    }
  }

  // .gitkeep files for empty dirs
  for (const type of NODE_TYPES) {
    const gitkeep = join(getTreeDir(), type, '.gitkeep');
    if (!existsSync(gitkeep)) {
      writeFileSync(gitkeep, '', 'utf-8');
    }
  }

  const checkpointsKeep = join(getCheckpointsDir(), '.gitkeep');
  if (!existsSync(checkpointsKeep)) {
    writeFileSync(checkpointsKeep, '', 'utf-8');
  }

  const linksKeep = join(getLinksDir(), '.gitkeep');
  if (!existsSync(linksKeep)) {
    writeFileSync(linksKeep, '', 'utf-8');
  }

  const snapshotsKeep = join(getSnapshotsDir(), '.gitkeep');
  if (!existsSync(snapshotsKeep)) {
    writeFileSync(snapshotsKeep, '', 'utf-8');
  }

  // Storage .gitignore
  const storageGitignore = join(getStorageDir(), '.gitignore');
  if (!existsSync(storageGitignore)) {
    writeFileSync(storageGitignore, '*\n!.gitignore\n', 'utf-8');
    created.push(storageGitignore);
  }

  return created;
}
