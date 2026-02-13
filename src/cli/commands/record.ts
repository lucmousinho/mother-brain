import { Command, Flags } from '@oclif/core';
import { readFileSync } from 'node:fs';
import { isInitialized } from '../../utils/paths.js';
import { recordCheckpoint } from '../../core/checkpoint.js';

export default class Record extends Command {
  static override description =
    'Record a Run Checkpoint from stdin JSON or a file. Validates with Zod, generates run_id if missing.';

  static override examples = [
    '$ motherbrain record --file examples/example_run_checkpoint.json',
    '$ cat run.json | motherbrain record',
  ];

  static override flags = {
    file: Flags.string({
      char: 'f',
      description: 'Path to checkpoint JSON file',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Record);

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    let jsonStr: string;

    if (flags.file) {
      jsonStr = readFileSync(flags.file, 'utf-8');
    } else {
      // Read from stdin
      jsonStr = await this.readStdin();
    }

    let data: unknown;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      this.error('Invalid JSON input.');
    }

    try {
      const result = await recordCheckpoint(data);
      this.log(JSON.stringify(result, null, 2));
    } catch (err) {
      if (err instanceof Error) {
        this.error(`Validation/recording failed: ${err.message}`);
      }
      throw err;
    }
  }

  private readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stdin = process.stdin;

      if (stdin.isTTY) {
        reject(new Error('No input provided. Use --file or pipe JSON to stdin.'));
        return;
      }

      stdin.on('data', (chunk) => chunks.push(chunk));
      stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stdin.on('error', reject);
    });
  }
}
