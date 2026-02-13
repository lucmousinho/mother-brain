import { Command, Flags } from '@oclif/core';
import { isInitialized } from '../../../utils/paths.js';

export default class ApiStart extends Command {
  static override description = 'Start the Mother Brain local API (Fastify) on port 7337.';

  static override examples = [
    '$ motherbrain api start',
    '$ motherbrain api start --port 8080',
  ];

  static override flags = {
    port: Flags.integer({
      char: 'p',
      description: 'Port to listen on',
      default: 7337,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ApiStart);

    if (!isInitialized()) {
      this.error('Mother Brain not initialized. Run "motherbrain init" first.');
    }

    const port = flags.port || parseInt(process.env.MB_API_PORT || '7337', 10);

    this.log(`Starting Mother Brain API on port ${port}...`);

    // Dynamic import to avoid loading Fastify at CLI parse time
    const { buildApp } = await import('../../../api/server.js');
    const app = await buildApp();

    try {
      await app.listen({ port, host: '127.0.0.1' });
      this.log(`Mother Brain API listening on http://127.0.0.1:${port}`);
      this.log('Press Ctrl+C to stop.\n');
      this.log('Endpoints:');
      this.log('  GET  /health');
      this.log('  POST /runs');
      this.log('  POST /nodes/upsert');
      this.log('  GET  /recall?q=...');
      this.log('  POST /policy/check');
    } catch (err) {
      this.error(`Failed to start API: ${err}`);
    }
  }
}
