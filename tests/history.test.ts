import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../apps/service/src/app.js';

test('revision history identifies human and agent commits without replacing project creation time', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'nwn-vfx-history-'));
  const app = await createApp({ dataDir });
  const call = async (operation: string, input: object, token = app.studio.config.ownerToken) => {
    const response = await app.inject({ method: 'POST', url: '/api/commands', headers: { host: '127.0.0.1:4317', authorization: `Bearer ${token}` },
      payload: { operation, input, idempotencyKey: randomUUID() } });
    const result = response.json(); assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result;
  };
  try {
    const first = await call('projects.create', { name: 'History fixture' });
    const project = first.data;
    const provisioned = await call('actors.create', { name: 'TLC history agent', scopes: ['read', 'edit'], projectIds: [project.id] });
    await delay(5);
    const edited = await call('changes.apply', { projectId: project.id, expectedRevision: 1, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .12 } }] }, provisioned.data.token);
    const record = await call('operations.get', { operationId: edited.operationId });
    const page = (await call('revisions.list', { projectId: project.id, limit: 1 }, provisioned.data.token)).data;
    assert.equal(page.items[0].revision, 2);
    assert.equal(page.items[0].actorId, provisioned.data.id);
    assert.equal(page.items[0].actorName, 'TLC history agent');
    assert.equal(page.items[0].actorKind, 'agent');
    assert.equal(page.items[0].committedAt, record.data.createdAt);
    assert.equal(page.items[0].createdAt, project.createdAt);
    assert.ok(page.items[0].committedAt > page.items[0].createdAt);
    const older = (await call('revisions.list', { projectId: project.id, limit: 1, cursor: page.nextCursor }, provisioned.data.token)).data.items[0];
    assert.equal(older.actorId, 'owner'); assert.equal(older.actorKind, 'owner');
    assert.equal(older.committedAt, (await call('operations.get', { operationId: first.operationId })).data.createdAt);
    // A damaged/legacy record must be explicit, rather than inventing an owner.
    app.studio.db.prepare('DELETE FROM operations WHERE id=?').run(first.operationId);
    const legacy = (await call('revisions.list', { projectId: project.id, limit: 1, cursor: page.nextCursor })).data.items[0];
    assert.equal(legacy.actorId, null); assert.equal(legacy.actorName, null); assert.equal(legacy.actorKind, null); assert.equal(legacy.committedAt, null);
  } finally { await app.close(); rmSync(dataDir, { recursive: true, force: true }); }
});
