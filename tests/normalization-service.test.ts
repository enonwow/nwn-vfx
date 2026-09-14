import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createApp } from '../apps/service/src/app.js';
import { orientationTexture } from './fixtures/rgba-texture.js';

test('explicit normalization preserves revision, replay, first provenance, rights and selective undo', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'nwn-vfx-normalization-service-'));
  let app = await createApp({ dataDir });
  const call = async (operation: string, input: object, token = app.studio.config.ownerToken, key = randomUUID()) =>
    (await app.inject({ method: 'POST', url: '/api/commands', headers: { host: '127.0.0.1:4317', authorization: `Bearer ${token}` }, payload: { operation, input, idempotencyKey: key } })).json();
  const ok = (result: any) => { assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result.data; };
  try {
    const project = ok(await call('projects.create', { preset: 'empty' }));
    const agent = ok(await call('actors.create', { name: 'Normalization author', projectIds: [project.id], scopes: ['read', 'edit'] }));
    const reader = ok(await call('actors.create', { name: 'Reader', projectIds: [project.id], scopes: ['read'] }));
    const bytes = orientationTexture(1254), originalSha256 = createHash('sha256').update(bytes).digest('hex');
    const strict = { projectId: project.id, expectedRevision: 1, fileName: 'source.png', pngBase64: Buffer.from(bytes).toString('base64') };
    assert.equal((await call('assets.import', strict, agent.token)).error.code, 'INVALID_TEXTURE');
    assert.equal(ok(await call('projects.inspect', { projectId: project.id })).revision, 1);
    const input = { ...strict, targetSize: 512 }, key = randomUUID();
    assert.equal((await call('assets.import', input, reader.token)).error.code, 'FORBIDDEN');
    const imported = await call('assets.import', input, agent.token, key), result = ok(imported);
    const asset = result.project.document.assets[0];
    assert.equal(result.project.revision, 2);
    assert.equal(asset.width, 512); assert.equal(asset.height, 512);
    assert.equal(asset.source.normalization.originalSha256, originalSha256);
    assert.equal(asset.id, createHash('sha256').update(Buffer.from(asset.pngBase64, 'base64')).digest('hex'));
    assert.equal(asset.source.sha256, asset.id); assert.notEqual(asset.id, originalSha256);
    assert.deepEqual(ok(await call('assets.import', input, agent.token, key)), result);
    assert.equal((await call('assets.import', { ...input, targetSize: 1024 }, agent.token, key)).error.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal((await call('assets.import', input, agent.token)).error.code, 'REVISION_CONFLICT');
    const duplicate = ok(await call('assets.import', { ...input, expectedRevision: 2, fileName: 'second-name.png' }, agent.token));
    assert.equal(duplicate.project.revision, 2);
    assert.deepEqual(duplicate.project.document.assets[0], asset, 'deduplication preserves original stored provenance');
    ok(await call('policy.set', { projectId: project.id, paused: true }));
    assert.equal((await call('assets.import', { ...input, expectedRevision: 2 }, agent.token)).error.code, 'AI_PAUSED');
    ok(await call('policy.set', { projectId: project.id, paused: false }));
    const other = ok(await call('projects.create', { preset: 'empty' }));
    assert.equal((await call('assets.import', { ...input, projectId: other.id }, agent.token)).error.code, 'FORBIDDEN');
    const changed = ok(await call('changes.apply', { projectId: project.id, expectedRevision: 2, changes: [{ type: 'layer.set', layerId: 'sparks', values: { midAlpha: 0.7 } }] }, agent.token));
    const undone = ok(await call('changes.revert', { projectId: project.id, expectedRevision: changed.revision, operationId: imported.operationId }, agent.token));
    assert.equal(undone.document.assets, undefined); assert.equal(undone.document.layers[0].midAlpha, 0.7);
    await app.close(); app = await createApp({ dataDir });
    assert.deepEqual(ok(await call('assets.get', { projectId: project.id, revision: 2, assetId: asset.id }, agent.token)), asset);
    assert.deepEqual(ok(await call('projects.inspect', { projectId: project.id })).document, undone.document);
  } finally {
    await app.close(); assert.equal(resolve(dataDir, '..'), resolve(tmpdir())); rmSync(dataDir, { recursive: true, force: true });
  }
});
