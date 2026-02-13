import 'dotenv/config';
import { run } from '@oclif/core';

await run(process.argv.slice(2), import.meta.url);
