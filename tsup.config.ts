import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { service: 'apps/service/src/main.ts', cli: 'apps/cli/src/main.ts' },
  format: ['esm'], target: 'node24', outDir: 'dist/node',
  bundle: true, splitting: true, sourcemap: true, clean: true,
  external: ['better-sqlite3', 'playwright'],
});
