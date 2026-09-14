import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { unzipSync } from 'fflate';
import { createApp } from '../apps/service/src/app.js';
import { createRenderer } from '../apps/service/src/render.js';
import { canonical } from '../apps/service/src/store.js';
import { makeMeshLayer, type Change } from '../packages/core/src/model.js';

// Explicit input paths are read only. All normalization goes through Studio's
// registered import operation; only new acceptance projects are authored.
const installed = process.argv.includes('--installed');
const inputs = process.argv.slice(2).filter(arg => arg !== '--installed').map(path => resolve(path));
assert.equal(inputs.length, 2, 'Pass two explicit source RGBA PNG paths, optionally --installed.');
const root = resolve(import.meta.dirname, '..'), cwd = 'C:/Projects/the last city';
const parent = join(root, 'output', installed ? 'normalization-installed' : 'normalization-cli');
await mkdir(parent, { recursive: true });
const out = await mkdtemp(join(parent, 'run-')), dataDir = join(out, 'instance');
const port = 14346, origin = installed ? 'http://127.0.0.1:4317' : `http://127.0.0.1:${port}`;
const cli = installed ? join(process.env.APPDATA!, 'npm/node_modules/nwn-vfx-studio/dist/node/cli.js') : join(root, 'dist/node/cli.js');
const app = installed ? undefined : await createApp({ dataDir, port, webDir: join(root, 'dist/web'), render: createRenderer(origin) });
if (app) await app.listen({ host: '127.0.0.1', port });
const env = { ...process.env };
if (!installed) {
  for (const key of ['NWN_VFX_TOKEN', 'NWN_VFX_ENDPOINT', 'NWN_VFX_WORKSPACE', 'NWN_VFX_DATA_DIR']) delete env[key];
  env.NWN_VFX_CONFIG = join(dataDir, 'config.json');
}
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const commands: Array<{ args: string[]; status: string; operationId?: string }> = [];
async function call(args: string[], expectedError?: string) {
  const child = spawn(process.execPath, [cli, '--json', ...args], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
  const code = await new Promise<number | null>((done, reject) => { child.on('error', reject); child.on('close', done); });
  let result: any; try { result = JSON.parse(stdout.trim()); } catch { throw new Error(`CLI JSON error (${code}): ${stderr}`); }
  commands.push({ args, status: result.status, ...(result.operationId ? { operationId: result.operationId } : {}) });
  if (expectedError) { assert.equal(result.error?.code, expectedError); assert.notEqual(code, 0); return result; }
  assert.equal(code, 0, JSON.stringify(result.error)); assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result.data;
}
const key = () => ['--idempotency-key', randomUUID()];
async function download(artifact: any, path: string) {
  const result = await call(['artifacts', 'get', artifact.id, '--out', path]);
  assert.equal(result.verifiedSha256, artifact.sha256); return readFile(path);
}
function ffmpegRgba(path: string) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}
try {
  const doctor = await call(['doctor']); assert.equal(doctor.client.version, '0.4.1');
  const originals = await Promise.all(inputs.map(async path => ({ path, sha256: sha(await readFile(path)) })));
  const runs: any[] = [];
  for (const targetSize of [512, 1024]) {
    const dir = join(out, String(targetSize)); await mkdir(dir);
    let project = await call(['projects', 'create', '--preset', 'empty', '--name', `PNG normalization ${targetSize} acceptance`, ...key()]);
    const assets: any[] = [], normalizedHashes: string[] = [];
    for (const [index, path] of inputs.entries()) {
      const args = ['assets', 'import', '--project', project.id, '--expected-revision', String(project.revision), '--file', path];
      await call([...args, ...key()], 'INVALID_TEXTURE');
      const imported = await call([...args, '--target-size', String(targetSize), ...key()]); project = imported.project;
      const asset = await call(['assets', 'get', imported.assetId, '--project', project.id]);
      assert.equal(asset.width, targetSize); assert.equal(asset.height, targetSize);
      assert.equal(asset.source.normalization.originalSha256, originals[index].sha256);
      const bytes = Buffer.from(asset.pngBase64, 'base64'); assert.equal(sha(bytes), asset.id);
      const pngPath = join(dir, `normalized-${index + 1}.png`); await writeFile(pngPath, bytes);
      normalizedHashes.push(sha(ffmpegRgba(pngPath)));
      const { pngBase64: _, ...metadata } = asset; assets.push(metadata);
    }
    const mesh = { ...makeMeshLayer('wave', 'Normalized wave', 'ring'), texture: `asset:${assets[0].id}` as const, blend: 'normal' as const, duration: 1.2,
      geometry: { kind: 'ring' as const, innerRadius: 0, outerRadius: 1, segments: 64 },
      animation: { scale: [{ time: 0, value: 0.2 }, { time: 0.6, value: 1 }, { time: 1.2, value: 1.4 }], alpha: [{ time: 0, value: 0 }, { time: 0.12, value: 0.9 }, { time: 1.2, value: 0 }] } };
    const changes: Change[] = [{ type: 'project.set', values: { duration: 1.2 } }, { type: 'layer.set', layerId: 'sparks', values: {
      texture: `asset:${assets[1].id}`, blend: 'normal', count: 6, start: 0, duration: 0.1, life: 1, speed: 0.2, spread: 1, gravity: 0.1,
      position: [0, 0, 0.15], color: '#ffffff', endColor: '#bbbbbb', alpha: 0, midAlpha: 0.65, endAlpha: 0, size: 0.15, midSize: 0.5, endSize: 0.65, midPercent: 0.35,
    } }, { type: 'layer.add', layer: mesh }];
    const patch = join(dir, 'changes.json'); await writeFile(patch, JSON.stringify(changes, null, 2));
    project = await call(['changes', 'apply', '--project', project.id, '--expected-revision', String(project.revision), '--input-file', patch, ...key()]);
    await writeFile(join(dir, 'project.json'), JSON.stringify(project, null, 2));
    const snapshotSha256 = sha(canonical(project.document)), jobs: any[] = [];
    for (const type of ['png', 'candidate']) {
      const args = type === 'png' ? ['preview', 'request', '--time', '.4', '--format', 'png'] : ['candidate', 'build'];
      const accepted = await call([...args, '--project', project.id, '--revision', String(project.revision), ...key()]);
      const job = await call(['jobs', 'wait', accepted.id, '--timeout', '90s']); assert.equal(job.status, 'succeeded'); jobs.push(job);
      const manifest = JSON.parse((await download(job.artifacts.find((a: any) => a.name === 'handoff.json'), join(dir, `${type}-handoff.json`))).toString('utf8'));
      assert.equal(manifest.snapshotSha256, snapshotSha256); assert.deepEqual(manifest.assets, assets);
      const name = type === 'png' ? 'preview.png' : 'candidate.zip';
      const bytes = await download(job.artifacts.find((a: any) => a.name === name), join(dir, name));
      if (type === 'candidate') {
        const files = unzipSync(bytes), tgaHashes: string[] = [];
        const validation = JSON.parse(Buffer.from(files['validation.json']).toString('utf8'));
        assert.equal(validation.nativeVerified, false); assert.equal(validation.readback.meshes[0].uv.length > 0, true);
        assert.deepEqual(validation.assets.map((a: any) => a.source), assets.map(a => a.source));
        for (const [name, data] of Object.entries(files)) if (name.endsWith('.tga')) {
          assert.equal(basename(name), name); const tgaPath = join(dir, name); await writeFile(tgaPath, data); tgaHashes.push(sha(ffmpegRgba(tgaPath)));
        }
        assert.deepEqual(tgaHashes.sort(), [...normalizedHashes].sort(), 'Independent FFmpeg RGBA of exported TGA equals stored PNG');
        await writeFile(join(dir, 'validation.json'), JSON.stringify(validation, null, 2));
      }
    }
    await call(['projects', 'export', '--project', project.id, '--revision', String(project.revision), '--out', join(dir, 'studio-project.zip'), ...key()]);
    const zip = unzipSync(await readFile(join(dir, 'studio-project.zip'))), zipManifest = JSON.parse(Buffer.from(zip['manifest.json']).toString('utf8'));
    for (const asset of assets) {
      assert.equal(sha(zip[`assets/${asset.id}.png`]), asset.id);
      assert.deepEqual(zipManifest.assets.find((a: any) => a.id === asset.id).source, asset.source);
    }
    runs.push({ targetSize, projectId: project.id, revision: project.revision, snapshotSha256, assets, rgbaSha256: normalizedHashes, jobs, independentPngTgaPixelsEqual: true, portablePayloadsVerified: true });
  }
  for (const original of originals) assert.equal(sha(await readFile(original.path)), original.sha256, 'Original source was not modified');
  const report = { version: '0.4.1', installed, cli, cwd, origin, originals, originalsUnchanged: true, strictRejected: true, runs, commands, nativeVerified: false };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(join(parent, 'latest.json'), JSON.stringify({ directory: out, report: join(out, 'report.json') }, null, 2));
  process.stdout.write(JSON.stringify({ directory: out, runs: runs.map(({ targetSize, projectId, snapshotSha256, assets }) => ({ targetSize, projectId, snapshotSha256, assets })), passed: true }) + '\n');
} finally { await app?.close(); }
