import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'apps/web', plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  resolve: { alias: { '@core': resolve('packages/core/src') } },
});
