import { Command } from '@oclif/core';

export default class EmbedModelWarmup extends Command {
  static override description =
    'Download embedding model and verify it works offline.';

  static override examples = ['$ motherbrain embed-model warmup'];

  async run(): Promise<void> {
    this.log('Warming up embedding model...\n');

    const { warmup, getModelInfo } = await import('../../../core/embeddings/embeddings.local.js');
    const info = getModelInfo();

    this.log(`  Model:     ${info.name}`);
    this.log(`  Dimensions: ${info.dimensions}`);
    this.log(`  Cache dir: ${info.cacheDir}`);
    this.log('');

    const start = Date.now();
    try {
      await warmup();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      this.log(`Model loaded and tested in ${elapsed}s.`);
      this.log('Offline-ready: yes');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error(`Warmup failed: ${msg}`);
    }
  }
}
