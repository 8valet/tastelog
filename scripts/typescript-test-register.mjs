import { register } from 'node:module';

// The self-hosted test machine runs Node 22 without built-in TypeScript
// stripping. This loader exists only for the optional test:library:compat run.
register(new URL('./typescript-test-loader.mjs', import.meta.url));
