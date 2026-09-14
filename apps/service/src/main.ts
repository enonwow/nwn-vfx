import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { createRenderer } from './render.js';

const port = Number(process.env.NWN_VFX_PORT ?? 4317);
const dataDir = resolve(process.env.NWN_VFX_DATA_DIR ?? join(homedir(), '.nwn-vfx'));
const bundledWebDir = fileURLToPath(new URL('../web', import.meta.url));
const sourceWebDir = fileURLToPath(new URL('../../../dist/web', import.meta.url));
const webDir = resolve(process.env.NWN_VFX_WEB_DIR ?? (existsSync(bundledWebDir) ? bundledWebDir : sourceWebDir));
const app = await createApp({ dataDir, port, webDir, render: createRenderer(`http://127.0.0.1:${port}`) });
try {
  await app.listen({ host: '127.0.0.1', port });
  process.stdout.write('NWN VFX Studio: http://127.0.0.1:' + port + '\n');
} catch (error) {
  await app.close(); throw error;
}
let closing = false;
const close = async () => { if (closing) return; closing = true; await app.close(); };
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
