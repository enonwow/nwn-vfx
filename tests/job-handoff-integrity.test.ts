import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { unzipSync } from 'fflate';
import { createApp } from '../apps/service/src/app.js';
import type { Artifact } from '../apps/service/src/store.js';

const host = '127.0.0.1:4317';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('candidate handoff is byte-identical loose and inside ZIP, with every content artifact hash verified and no self-reference', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'nwn-vfx-handoff-integrity-'));
  const app = await createApp({ dataDir });
  const command = async (operation: string, input: Record<string, unknown>) => {
    const response = await app.inject({ method: 'POST', url: '/api/commands', headers: { host, authorization: `Bearer ${app.studio.config.ownerToken}` },
      payload: { operation, input, idempotencyKey: randomUUID() } });
    const result = response.json(); assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result.data;
  };
  const download = async (artifact: Artifact) => {
    const response = await app.inject({ url: artifact.downloadUrl, headers: { host, authorization: `Bearer ${app.studio.config.ownerToken}` } });
    assert.equal(response.statusCode, 200, artifact.name);
    assert.equal(response.rawPayload.length, artifact.size, artifact.name + ': loose size');
    assert.equal(sha256(response.rawPayload), artifact.sha256, artifact.name + ': loose SHA-256');
    assert.deepEqual(artifact.hash, { algorithm: 'sha256', value: artifact.sha256 });
    return response.rawPayload;
  };
  try {
    const project = await command('projects.create', { preset: 'coil', name: 'Handoff integrity fixture' });
    const accepted = await command('candidate.build', { projectId: project.id, revision: project.revision });
    await app.studio.drainJobs();
    const job = await command('jobs.get', { jobId: accepted.id });
    assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
    const artifacts = job.artifacts as Artifact[];
    const looseArtifact = artifacts.find(artifact => artifact.name === 'handoff.json');
    const archiveArtifact = artifacts.find(artifact => artifact.name === 'candidate.zip');
    assert(looseArtifact); assert(archiveArtifact);
    const loose = await download(looseArtifact), archive = unzipSync(await download(archiveArtifact));
    assert(archive['handoff.json']);
    assert.equal(Buffer.from(archive['handoff.json']).equals(loose), true, 'The same immutable handoff bytes must be published loose and inside the archive');
    const manifest = JSON.parse(loose.toString('utf8'));
    assert.equal(manifest.projectId, project.id); assert.equal(manifest.revision, project.revision); assert.equal(manifest.jobId, job.id);
    assert.equal(manifest.nativeVerified, false);
    const references = manifest.artifacts as Artifact[];
    assert.equal(references.some(artifact => ['handoff.json', 'candidate.zip'].includes(artifact.name)), false, 'A manifest cannot claim its own hash or the hash of its enclosing archive');
    assert.equal(references.length, artifacts.length - 2);
    assert.deepEqual(Object.keys(archive).sort(), [...references.map(artifact => artifact.name), 'handoff.json'].sort());
    for (const reference of references) {
      assert.deepEqual(reference, artifacts.find(artifact => artifact.id === reference.id), reference.name + ': metadata');
      const bytes = archive[reference.name]; assert(bytes, reference.name + ': archive entry');
      assert.equal(bytes.byteLength, reference.size, reference.name + ': archive size');
      assert.equal(sha256(bytes), reference.sha256, reference.name + ': archive SHA-256');
      assert.equal(Buffer.from(bytes).equals(await download(reference)), true, reference.name + ': archived and loose bytes');
    }
  } finally {
    await app.close();
    assert.equal(resolve(dirname(dataDir)), resolve(tmpdir())); assert(basename(dataDir).startsWith('nwn-vfx-handoff-integrity-'));
    await rm(dataDir, { recursive: true, force: true });
  }
});
