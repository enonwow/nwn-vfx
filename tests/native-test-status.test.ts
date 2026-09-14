import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/service/src/app.js';
import { validateOperationOutput } from '../packages/contracts/src/schema.js';
import { canonical, hash, type Job } from '../apps/service/src/store.js';
import { WEBMCP_OPERATIONS } from '../apps/web/src/webmcp-schemas.js';

async function fixture() {
  const dataDir = mkdtempSync(join(tmpdir(), 'nwn-vfx-native-status-'));
  const app = await createApp({ dataDir });
  const call = (operation: string, input: Record<string, unknown> = {}, actor = 'owner') =>
    app.studio.dispatch(actor, { operation, input, idempotencyKey: randomUUID() });
  return { app, call, close: async () => { await app.close(); rmSync(dataDir, { recursive: true, force: true }); } };
}
function ok(result: any): any { assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result.data; }

test('native status binds a real candidate revision while preserving missing native proof', async () => {
  const f = await fixture();
  try {
    const project = ok(f.call('projects.create', { preset: 'empty', name: 'Native status fixture' }));
    const candidate = ok(f.call('candidate.build', { projectId: project.id, revision: 1 }));
    await f.app.studio.drainJobs();
    const beforeJobs = ok(f.call('jobs.list', { projectId: project.id })).items.length;
    const status = ok(f.call('native.test.status', { candidateId: candidate.id }));
    assert.equal(status.state, 'awaiting_qualified_runner');
    assert.equal(status.candidateStatus, 'succeeded');
    assert.equal(status.snapshotSha256, hash(canonical(project.document)));
    assert.equal(status.projectId, project.id); assert.equal(status.revision, 1);
    assert.equal(status.nativeVerified, false); assert.equal(status.nativeTestAvailable, false);
    assert.equal(status.proofCompleteness, 'missing');
    assert.equal(status.externalState, 'not_observed_by_studio');
    assert.deepEqual(status.nativeArtifacts, []); assert.ok(status.candidateArtifacts.length >= 3);
    assert.equal(status.dependencies.find((d: any) => d.id === 'candidate_resources').status, 'ready');
    assert.ok(status.dependencies.filter((d: any) => d.id !== 'candidate_resources').every((d: any) => d.status === 'missing'));
    const requested = f.call('native.test.request', { candidateId: candidate.id, profileId: 'external-profile' });
    assert.equal(requested.error?.code, 'CAPABILITY_UNAVAILABLE');
    assert.deepEqual((requested.error?.details as any).nativeStatus, status);
    assert.equal(ok(f.call('jobs.list', { projectId: project.id })).items.length, beforeJobs);
    assert.deepEqual(ok(f.call('projects.inspect', { projectId: project.id })), project);
    for (const forged of [{ ...status, nativeVerified: true }, { ...status, proofCompleteness: 'verified' }, { ...status, nativeArtifacts: [status.candidateArtifacts[0]] }])
      assert.throws(() => validateOperationOutput('native.test.status', forged));
    const catalog = ok(f.call('operations.list')).items;
    assert.equal(catalog.find((o: any) => o.name === 'native.test.status').available, true);
    assert.equal(catalog.find((o: any) => o.name === 'native.test.request'), undefined);
    assert.equal(ok(f.call('schema.get', { operation: 'native.test.request' })).available, false);
    assert.equal(ok(f.call('capabilities')).nativeWorkflow.runnerConfigured, false);
    assert.equal(ok(f.call('doctor')).nativeWorkflow.statusOperation, 'native.test.status');
    assert.ok((WEBMCP_OPERATIONS as readonly string[]).includes('native.test.status'));
    assert.ok(!(WEBMCP_OPERATIONS as readonly string[]).includes('native.test.request'));
  } finally { await f.close(); }
});

test('native status distinguishes candidate failure and pending work without trusting supplied verdicts', async () => {
  const f = await fixture();
  try {
    const project = ok(f.call('projects.create', { preset: 'empty' }));
    const now = new Date().toISOString();
    const candidate: Job = { id: randomUUID(), jobId: '', actorId: 'owner', projectId: project.id, revision: 1,
      type: 'candidate.build', status: 'blocked', createdAt: now, updatedAt: now, artifacts: [] };
    candidate.jobId = candidate.id;
    f.app.studio.saveJob(candidate, canonical(project.document), '{}');
    const pending = ok(f.call('native.test.status', { candidateId: candidate.id }));
    assert.equal(pending.state, 'candidate_pending'); assert.deepEqual(pending.candidateArtifacts, []);
    candidate.status = 'failed'; candidate.error = { code: 'EXPORT_ERROR', message: 'Fixture export failure' };
    f.app.studio.saveJob(candidate);
    const failed = ok(f.call('native.test.status', { candidateId: candidate.id }));
    assert.equal(failed.state, 'candidate_failed');
    assert.equal(failed.dependencies[0].status, 'failed');
    assert.equal(f.call('native.test.status', { candidateId: 'unknown' }).error?.code, 'NOT_FOUND');
    for (const value of [{ nativeVerified: true }, { evidence: { status: 'passed' } }, { manifestPath: 'C:/private/proof.json' }])
      assert.equal(f.call('native.test.status', { candidateId: candidate.id, ...value }).error?.code, 'VALIDATION_ERROR');
    candidate.type = 'preview.request'; f.app.studio.saveJob(candidate);
    assert.equal(f.call('native.test.status', { candidateId: candidate.id }).error?.code, 'INVALID_CANDIDATE');
  } finally { await f.close(); }
});

test('native dependency inspection enforces the candidate project and read scope', async () => {
  const f = await fixture();
  try {
    const project = ok(f.call('projects.create', { preset: 'empty' }));
    const candidate = ok(f.call('candidate.build', { projectId: project.id, revision: 1 }));
    await f.app.studio.drainJobs();
    const permitted = ok(f.call('actors.create', { name: 'Reader', projectIds: [project.id], scopes: ['read'] }));
    const foreign = ok(f.call('actors.create', { name: 'Foreign', projectIds: [], scopes: ['read'] }));
    const noRead = ok(f.call('actors.create', { name: 'No read', projectIds: [project.id], scopes: ['jobs'] }));
    ok(f.call('policy.set', { projectId: project.id, paused: true }));
    assert.equal(ok(f.call('native.test.status', { candidateId: candidate.id }, permitted.id)).nativeVerified, false);
    for (const actor of [foreign, noRead]) {
      assert.equal(f.call('native.test.status', { candidateId: candidate.id }, actor.id).error?.code, 'FORBIDDEN');
      assert.equal(f.call('native.test.request', { candidateId: candidate.id, profileId: 'external' }, actor.id).error?.code, 'FORBIDDEN');
    }
  } finally { await f.close(); }
});
