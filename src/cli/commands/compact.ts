import { Command, Flags } from '@oclif/core';
import { isInitialized } from '../../utils/paths.js';
import { compactDay } from '../../core/compact.js';

export default class Compact extends Command {
  static override description =
    'Compact a day of checkpoints into patterns/decisions and a daily summary.';

  static override examples = [
    '$ motherbrain compact --day 2025-01-15',
    '$ motherbrain compact --day 2025-01-15',
  ];

  static override flags = {
    day: Flags.string({
      description: 'Day to compact (YYYY-MM-DD)',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Compact);

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(flags.day)) {
      this.error('Invalid date format. Use YYYY-MM-DD.');
    }

    const result = await compactDay(flags.day);

    this.log(`Compact results for ${result.day}:`);
    this.log(`  Runs processed:    ${result.runs_processed}`);
    this.log(`  Patterns created:  ${result.patterns_created.length}`);
    if (result.summary_path) {
      this.log(`  Summary:           ${result.summary_path}`);
    }
    if (result.runs_processed === 0) {
      this.log('  No runs found for this day.');
    }
  }
}
