import { Command } from '@oclif/core';

export default class EmbedModelInfo extends Command {
  static override description =
    'Show embedding model configuration and status.';

  static override examples = ['$ motherbrain embed-model info'];

  async run(): Promise<void> {
    const { getModelInfo } = await import('../../../core/embeddings/embeddings.local.js');
    const { countVectorDocs, vectorStoreReady } = await import(
      '../../../core/vectorstore/lancedb.store.js'
    );
    const { embeddingCacheSize } = await import(
      '../../../core/embeddings/embeddings.cache.js'
    );

    const info = getModelInfo();
    const storeOk = await vectorStoreReady();
    const docCount = storeOk ? await countVectorDocs() : 0;

    this.log('Embedding Model');
    this.log(`  Name:       ${info.name}`);
    this.log(`  Dimensions: ${info.dimensions}`);
    this.log(`  Cache dir:  ${info.cacheDir}`);
    this.log(`  Loaded:     ${info.loaded ? 'yes' : 'no'}`);
    this.log('');
    this.log('Vector Store');
    this.log(`  Ready:      ${storeOk ? 'yes' : 'no'}`);
    this.log(`  Documents:  ${docCount}`);
    this.log('');
    this.log('Embedding Cache');
    this.log(`  Entries:    ${embeddingCacheSize()}`);
  }
}
