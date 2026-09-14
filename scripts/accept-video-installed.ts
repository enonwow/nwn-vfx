import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { canonical } from '../apps/service/src/store.js';
import { STUDIO_VERSION } from '../packages/core/src/model.js';

// Acceptance through the installed CLI, using an explicitly provided saved
// snapshot. It renders only: no project edits, forks, or browser interaction.
assert.equal(process.argv.length, 4, 'Pass a saved projects.inspect JSON and a fresh output directory.');
const snapshotPath = resolve(process.argv[2]), out = resolve(process.argv[3]);
const project = JSON.parse(await readFile(snapshotPath, 'utf8')).data;
const cli = join(process.env.APPDATA!, 'npm/node_modules/nwn-vfx-studio/dist/node/cli.js');
const snapshotSha256 = createHash('sha256').update(canonical(project.document)).digest('hex');
await mkdir(out); // Fresh output prevents accidental overwrite/reissue.
const commands: unknown[] = [];
async function call(args: string[]) {
  const child = spawn(process.execPath, [cli, '--json', ...args], { cwd: 'C:/Projects/the last city', windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
  const code = await new Promise<number | null>((done, reject) => { child.on('error', reject); child.on('close', done); });
  const reply = JSON.parse(stdout.trim());
  commands.push({ args, code, status: reply.status, error: reply.error });
  await writeFile(join(out, 'commands.json'), JSON.stringify(commands, null, 2));
  if (args[0] === 'jobs' && args[1] === 'wait' && reply.error?.code === 'WAIT_TIMEOUT') return { status: 'running' };
  assert.equal(code, 0, JSON.stringify(reply.error ?? stderr.slice(-2000)));
  assert.notEqual(reply.status, 'failed', JSON.stringify(reply.error));
  return reply.data;
}
const before = await call(['projects', 'inspect', '--project', project.id, '--revision', String(project.revision)]);
assert.equal(canonical(before.document), canonical(project.document));
const doctor = await call(['doctor']); assert.equal(doctor.client.version, STUDIO_VERSION);
await writeFile(join(out, 'doctor.json'), JSON.stringify(doctor, null, 2));
async function render(label: string, format: 'png' | 'webm', time: number) {
  const key = `${project.id}-r${project.revision}-studio-${STUDIO_VERSION}-${label}-${Date.now()}`;
  const created = await call(['preview', 'request', '--project', project.id, '--revision', String(project.revision),
    '--time', String(time), '--format', format, '--idempotency-key', key]);
  await writeFile(join(out, `${label}.request.json`), JSON.stringify({ key, created }, null, 2));
  let job = created;
  const deadline = Date.now() + 10 * 60_000;
  while (['queued', 'running', 'cancelling'].includes(job.status)) {
    assert.ok(Date.now() < deadline, `Acceptance wait expired; job ${created.id} remains available through jobs get.`);
    job = await call(['jobs', 'wait', created.id, '--timeout', '30s']);
  }
  await writeFile(join(out, `${label}.job.json`), JSON.stringify(job, null, 2));
  assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
  assert.equal(job.metadata.rendererVersion, STUDIO_VERSION);
  const artifact = job.artifacts.find((item: any) => item.name === `preview.${format}`);
  const handoff = job.artifacts.find((item: any) => item.name === 'handoff.json');
  assert.ok(artifact && handoff);
  const path = join(out, `${label}.${format}`), handoffPath = join(out, `${label}.handoff.json`);
  for (const [entry, destination] of [[artifact, path], [handoff, handoffPath]] as const) {
    const result = await call(['artifacts', 'get', entry.id, '--out', destination]);
    assert.equal(result.verifiedSha256, entry.sha256);
  }
  const manifest = JSON.parse(await readFile(handoffPath, 'utf8'));
  assert.equal(manifest.snapshotSha256, snapshotSha256);
  assert.equal(manifest.projectId, project.id); assert.equal(manifest.revision, project.revision);
  assert.equal(manifest.jobId, job.id); assert.equal(manifest.metadata.rendererVersion, STUDIO_VERSION);
  assert.equal(manifest.metadata.format, format); assert.equal(manifest.metadata.time, time);
  console.log(`${label}: ${job.id}, ${artifact.size} B`);
  return { label, time, path, handoffPath, jobId: job.id, artifactId: artifact.id, sha256: artifact.sha256,
    wallSeconds: (Date.parse(job.updatedAt) - Date.parse(job.createdAt)) / 1000 };
}
const video = await render('video', 'webm', 0);
const references = [];
for (const [label, requestedTime, index] of [['before', .6, 18], ['strike', .88, 26], ['dust', 1.18, 35],
  ['fade', 1.8, 54], ['end', 3.65, 110]] as const) {
  const result = await render(label, 'png', index / 30);
  references.push({ label, requestedTime, referenceTime: index / 30, referencePath: result.path, handoffPath: result.handoffPath });
}
const background = await render('background', 'png', project.document.duration);
const after = await call(['projects', 'inspect', '--project', project.id, '--revision', String(project.revision)]);
assert.equal(canonical(after.document), canonical(before.document));
await writeFile(join(out, 'references.json'), JSON.stringify(references, null, 2));
await writeFile(join(out, 'render-report.json'), JSON.stringify({ version: STUDIO_VERSION, projectId: project.id,
  revision: project.revision, snapshotSha256, savedRevisionUnchanged: true, video, references, background,
  nativeVerified: false }, null, 2));
console.log(`REPORT ${join(out, 'render-report.json')}`);
