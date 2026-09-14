import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { canonical } from '../apps/service/src/store.js';
import { STUDIO_VERSION, type AxisAngle } from '../packages/core/src/model.js';

// Installed public CLI qualification in a new project, never a consumer project.
assert.equal(process.argv.length, 3, 'Pass a fresh explicit output directory.');
const out = resolve(process.argv[2]); await mkdir(out);
const cli = join(process.env.APPDATA!, 'npm/node_modules/nwn-vfx-studio/dist/node/cli.js');
const commands: unknown[] = [], sha = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
async function call(args: string[], allowTimeout = false) {
  const child = spawn(process.execPath, [cli, '--json', ...args], { cwd: 'C:/Projects/the last city', windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
  const code = await new Promise<number | null>((done, reject) => { child.on('error', reject); child.on('close', done); });
  const reply = JSON.parse(stdout.trim()); commands.push({ args, code, status: reply.status, error: reply.error });
  await writeFile(join(out, 'commands.json'), JSON.stringify(commands, null, 2));
  if (allowTimeout && reply.error?.code === 'WAIT_TIMEOUT') return { status: 'running' };
  assert.equal(code, 0, JSON.stringify(reply.error ?? stderr.slice(-2000))); assert.notEqual(reply.status, 'failed'); return reply.data;
}
const key = () => ['--idempotency-key', randomUUID()];
const doctor = await call(['doctor']); assert.equal(doctor.client.version, STUDIO_VERSION);
const capabilities = await call(['capabilities']); assert.equal(capabilities.emitterOrientation.gravitySpace, 'world');
assert.deepEqual(capabilities.documentSchemaVersions, [1, 2, 3, 4]);
await writeFile(join(out, 'discovery.json'), JSON.stringify({ doctor, capabilities }, null, 2));
let project = await call(['projects', 'create', '--name', `Orientation acceptance ${STUDIO_VERSION}`, '--preset', 'empty', ...key()]);
await writeFile(join(out, 'created.json'), JSON.stringify(project, null, 2));
async function apply(label: string, changes: unknown[]) {
  const path = join(out, `${label}.changes.json`); await writeFile(path, JSON.stringify(changes, null, 2));
  project = await call(['changes', 'apply', '--project', project.id, '--expected-revision', String(project.revision), '--input-file', path, ...key()]);
  await writeFile(join(out, `${label}.project.json`), JSON.stringify(project, null, 2));
}
async function job(label: string, args: string[]) {
  let result = await call([...args, '--project', project.id, '--revision', String(project.revision), ...key()]);
  const id = result.id, deadline = Date.now() + 10 * 60_000;
  await writeFile(join(out, `${label}.request.json`), JSON.stringify(result, null, 2));
  while (['queued', 'running', 'cancelling'].includes(result.status)) {
    assert.ok(Date.now() < deadline, `Waiting expired; recover job ${id}.`);
    result = await call(['jobs', 'wait', id, '--timeout', '30s'], true);
  }
  assert.equal(result.status, 'succeeded', JSON.stringify(result.error));
  const dir = join(out, label); await mkdir(dir);
  await writeFile(join(dir, 'job.json'), JSON.stringify(result, null, 2));
  for (const artifact of result.artifacts) {
    const downloaded = await call(['artifacts', 'get', artifact.id, '--out', join(dir, artifact.name)]);
    assert.equal(downloaded.verifiedSha256, artifact.sha256);
  }
  const handoff = JSON.parse(await readFile(join(dir, 'handoff.json'), 'utf8'));
  assert.equal(handoff.projectId, project.id); assert.equal(handoff.revision, project.revision);
  assert.equal(handoff.snapshotSha256, sha(canonical(project.document)));
  console.log(`${label}: revision ${project.revision}, ${result.id}`);
  return { jobId: result.id, dir, handoff, result };
}
const base = { name: '+Z', start: 0, duration: .1, life: 1.6, count: 40, speed: 2, spread: .09, gravity: 1.2,
  position: [0, 0, .3], scale: 1, seed: 42, color: '#ffbb00', endColor: '#ffbb00', alpha: 1, endAlpha: 1,
  size: .035, endSize: .035, texture: 'glow', update: 'Explosion' };
await apply('configure', [{ type: 'project.set', values: { duration: 2 } }, { type: 'layer.set', layerId: 'sparks', values: base }]);
assert.equal(project.document.schemaVersion, 1);
const legacy = await job('legacy-neutral', ['preview', 'request', '--time', '.4', '--format', 'png']);
await apply('explicit-neutral', [{ type: 'layer.set', layerId: 'sparks', values: { orientation: [0, 0, 1, 0] } }]);
assert.equal(project.document.schemaVersion, 4);
const neutral = await job('explicit-neutral', ['preview', 'request', '--time', '.4', '--format', 'png']);
assert.equal(sha(await readFile(join(legacy.dir, 'preview.png'))), sha(await readFile(join(neutral.dir, 'preview.png'))));
const layer = project.document.layers[0];
const axes: Array<{ id: string; orientation: AxisAngle; color: string }> = [
  { id: 'side_x', orientation: [0, 1, 0, Math.PI / 2], color: '#00ffff' },
  { id: 'side_y', orientation: [1, 0, 0, -Math.PI / 2], color: '#ff66ff' },
];
await apply('three-axes', axes.map(axis => ({ type: 'layer.add', layer: { ...layer, ...axis, name: axis.id, endColor: axis.color } })));
const chosenRevision = project.revision, chosenHash = sha(canonical(project.document));
const renders = [];
for (const time of [.3, .6, .9]) renders.push(await job(`axes-${time}`, ['preview', 'request', '--time', String(time), '--format', 'png']));
const video = await job('axes-video', ['preview', 'request', '--time', '0', '--format', 'webm']);
const background = await job('background', ['preview', 'request', '--time', '2', '--format', 'png']);
await writeFile(join(out, 'references.json'), JSON.stringify(renders.map((value, index) => ({
  label: `axes-${index}`, requestedTime: [.3, .6, .9][index], referenceTime: [.3, .6, .9][index],
  referencePath: join(value.dir, 'preview.png'), handoffPath: join(value.dir, 'handoff.json'),
})), null, 2));
const candidate = await job('candidate', ['candidate', 'build']);
const validation = JSON.parse(await readFile(join(candidate.dir, 'validation.json'), 'utf8'));
assert.equal(validation.exporterVersion, `nwn-ascii-vfx-${STUDIO_VERSION}`);
assert.equal(validation.structuralValidation, 'passed'); assert.equal(validation.nativeVerified, false);
assert.equal(validation.checks.emitterOrientationRead, true); assert.equal(validation.checks.emitterWorldSpaceFlagsRead, true);
for (const source of project.document.layers) {
  const written = validation.readback.layers.find((item: any) => item.layerId === source.id);
  assert.ok(written); assert.deepEqual(written.orientation, source.orientation ?? [0, 0, 1, 0]);
  assert.deepEqual(written.parentOrientation, [0, 0, 1, 0]);
  assert.equal(written.mass, source.gravity); assert.equal(written.velocity, source.speed);
}
const current = await call(['projects', 'inspect', '--project', project.id]);
assert.equal(current.revision, chosenRevision); assert.equal(sha(canonical(current.document)), chosenHash);
await writeFile(join(out, 'report.json'), JSON.stringify({ passed: true, version: STUDIO_VERSION, projectId: project.id,
  revision: chosenRevision, snapshotSha256: chosenHash, legacyNeutralPngIdentical: true,
  renders: renders.map(value => ({ jobId: value.jobId, dir: value.dir })), video: { jobId: video.jobId, dir: video.dir },
  background: { jobId: background.jobId, dir: background.dir },
  candidate: { jobId: candidate.jobId, dir: candidate.dir, validation }, nativeVerified: false }, null, 2));
console.log(`REPORT ${join(out, 'report.json')}`);
