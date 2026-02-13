import { Command, Flags } from '@oclif/core';
import { isInitialized } from '../../utils/paths.js';
import { policyCheck } from '../../core/policy.js';

export default class PolicyCheck extends Command {
  static override description =
    'Validate an action against allow/deny policies. Exit code 0 = allowed, 3 = denied.';

  static override examples = [
    '$ motherbrain policy-check --cmd "git push origin main"',
    '$ motherbrain policy-check --path "/etc/passwd"',
    '$ motherbrain policy-check --host "api.example.com"',
    '$ motherbrain policy-check --cmd "rm -rf /"',
  ];

  static override flags = {
    cmd: Flags.string({ description: 'Command to check' }),
    path: Flags.string({ description: 'File path to check' }),
    host: Flags.string({ description: 'Host to check' }),
    'agent-id': Flags.string({ description: 'Agent ID for audit' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PolicyCheck);

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    if (!flags.cmd && !flags.path && !flags.host) {
      this.error('At least one of --cmd, --path, or --host is required.');
    }

    const result = policyCheck({
      cmd: flags.cmd,
      path: flags.path,
      host: flags.host,
      agent_id: flags['agent-id'],
    });

    this.log(JSON.stringify(result, null, 2));

    if (!result.allowed) {
      this.exit(3);
    }
  }
}
