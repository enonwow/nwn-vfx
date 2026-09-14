import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { createApp, type StudioApp } from '../apps/service/src/app.js';
import type { Command } from '../packages/core/src/model.js';

const host = '127.0.0.1:4317';
async function fixture(render?: Parameters<typeof createApp>[0]['render']) {
  const dataDir = mkdtempSync(join(tmpdir(), 'nwn-vfx-service-'));
  const app = await createApp({ dataDir, render });
  return { app, dataDir, close: async () => { await app.close(); rmSync(dataDir, { recursive: true, force: true }); } };
}
async function command(app: StudioApp, operation: string, input: Record<string, unknown> = {}, options: { key?: string; token?: string; noKey?: boolean } = {}) {
  const payload: Command = { operation, input, ...(options.noKey ? {} : { idempotencyKey: options.key ?? randomUUID() }) };
  const response = await app.inject({ method: 'POST', url: '/api/commands', headers: { host, authorization: 'Bearer ' + (options.token ?? app.studio.config.ownerToken) }, payload });
  return response.json();
}
const created = async (app: StudioApp, name = 'Test') => {
  const result = await command(app, 'projects.create', { name, preset: 'coil' });
  assert.equal(result.status, 'ok', JSON.stringify(result.error)); return result.data;
};

test('browser session is same-origin only; Host, Origin, authentication and version are enforced', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.app.inject({ url: '/api/session', headers: { host } })).statusCode, 401);
    assert.equal((await f.app.inject({ url: '/api/session', headers: { host, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } })).statusCode, 403);
    assert.equal((await f.app.inject({ url: '/api/health', headers: { host: 'evil.example:4317' } })).statusCode, 403);
    const session = await f.app.inject({ url: '/api/session', headers: { host, referer: 'http://' + host + '/', 'sec-fetch-site': 'same-origin' } });
    assert.equal(session.statusCode, 200); assert.equal(session.json().actor.kind, 'owner');
    const cookie = String(session.headers['set-cookie']);
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.ok(!session.body.includes(f.app.studio.config.ownerToken));
    const unauth = await f.app.inject({ method: 'POST', url: '/api/commands', headers: { host }, payload: { operation: 'projects.list', input: {} } });
    assert.equal(unauth.statusCode, 401);
    const badVersion = await f.app.inject({ method: 'POST', url: '/api/commands', headers: { host, authorization: 'Bearer ' + f.app.studio.config.ownerToken }, payload: { operation: 'projects.create', input: {}, contractVersion: '999', idempotencyKey: randomUUID() } });
    assert.equal(badVersion.json().error.code, 'CONTRACT_MISMATCH');
    const forged = await command(f.app, 'projects.create', { actorId: 'owner' }); assert.equal(forged.error.code, 'VALIDATION_ERROR');
    const cookieWrite = await f.app.inject({ method: 'POST', url: '/api/commands', headers: { host, cookie: cookie.split(';')[0], origin: 'http://' + host, 'sec-fetch-site': 'same-origin' }, payload: { operation: 'projects.create', input: {}, idempotencyKey: randomUUID() } });
    assert.equal(cookieWrite.json().status, 'ok');
    f.app.studio.db.prepare('UPDATE sessions SET expires=?').run(Date.now() - 1);
    const renewed = await f.app.inject({ url: '/api/session', headers: { host, cookie: cookie.split(';')[0], referer: 'http://' + host + '/', 'sec-fetch-site': 'same-origin' } });
    assert.equal(renewed.statusCode, 200); assert.notEqual(renewed.headers['set-cookie'], session.headers['set-cookie']);
    const wrongBearer = await f.app.inject({ url: '/api/session', headers: { host, authorization: 'Bearer ' + 'a'.repeat(43), referer: 'http://' + host + '/', 'sec-fetch-site': 'same-origin' } });
    assert.equal(wrongBearer.statusCode, 401); assert.equal(wrongBearer.headers['set-cookie'], undefined);
  } finally { await f.close(); }
});

test('real SQLite CAS and retry preserve one result after subsequent edits and restart', async () => {
  const f = await fixture(); let app = f.app;
  try {
    const p = await created(app), key = randomUUID();
    const input = { projectId: p.id, expectedRevision: 1, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .09 } }] };
    const [first, conflict] = await Promise.all([command(app, 'changes.apply', input, { key }), command(app, 'changes.apply', { ...input, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .12 } }] })]);
    assert.equal(first.status, 'ok'); assert.equal(conflict.error.code, 'REVISION_CONFLICT');
    await command(app, 'changes.apply', { projectId: p.id, expectedRevision: 2, changes: [{ type: 'layer.set', layerId: 'smoke', values: { color: '#222222' } }] });
    const before = app.studio.config; await app.close(); app = await createApp({ dataDir: f.dataDir });
    assert.equal(app.studio.config.instanceId, before.instanceId); assert.equal(app.studio.config.ownerToken, before.ownerToken);
    const retry = await command(app, 'changes.apply', input, { key }); assert.equal(retry.operationId, first.operationId); assert.equal(retry.data.revision, 2);
    const mismatch = await command(app, 'changes.apply', { ...input, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .1 } }] }, { key }); assert.equal(mismatch.error.code, 'IDEMPOTENCY_CONFLICT');
    const inspected = await command(app, 'projects.inspect', { projectId: p.id }); assert.equal(inspected.data.revision, 3); assert.equal(inspected.data.document.layers[0].size, .09);
    const resolved = await command(app, 'operations.resolve', { projectId: p.id, operation: 'changes.apply', idempotencyKey: key }); assert.equal(resolved.data.operationId, first.operationId);
    const events = await command(app, 'events.list', { projectId: p.id, cursor: 0 }); assert.equal(events.data.items.filter((e: any) => e.type === 'project.changed').length, 3);
  } finally { await app.close(); rmSync(f.dataDir, { recursive: true, force: true }); }
});

test('selective undo retains independent human edit and refuses touched-back and structural dependencies', async () => {
  const f = await fixture();
  try {
    const p = await created(f.app);
    const a = await command(f.app, 'changes.apply', { projectId: p.id, expectedRevision: 1, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .1 } }] });
    await command(f.app, 'changes.apply', { projectId: p.id, expectedRevision: 2, changes: [{ type: 'layer.set', layerId: 'smoke', values: { color: '#123456' } }] });
    const undo = await command(f.app, 'changes.revert', { projectId: p.id, expectedRevision: 3, operationId: a.operationId });
    assert.equal(undo.status, 'ok'); assert.equal(undo.data.document.layers[0].size, p.document.layers[0].size); assert.equal(undo.data.document.layers[2].color, '#123456');
    const b = await command(f.app, 'changes.apply', { projectId: p.id, expectedRevision: 4, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .2 } }] });
    await command(f.app, 'changes.apply', { projectId: p.id, expectedRevision: 5, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .3 } }] });
    await command(f.app, 'changes.apply', { projectId: p.id, expectedRevision: 6, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .2 } }] });
    assert.equal((await command(f.app, 'changes.revert', { projectId: p.id, expectedRevision: 7, operationId: b.operationId })).error.code, 'UNDO_CONFLICT');
  } finally { await f.close(); }
});

test('project scopes, read-only handoff, pause, locks and revocation constrain all adapters and replay', async () => {
  const f = await fixture();
  try {
    const p = await created(f.app), other = await created(f.app, 'Other');
    const actor = await command(f.app, 'actors.create', { name: 'TLC', projectIds: [p.id], scopes: ['read', 'edit', 'jobs', 'artifacts', 'build', 'review'] });
    const token = actor.data.token, key = randomUUID();
    assert.equal((await command(f.app, 'projects.inspect', { projectId: other.id }, { token })).error.code, 'FORBIDDEN');
    assert.equal((await command(f.app, 'projects.list', {}, { token })).data.items.length, 1);
    const edit = { projectId: p.id, expectedRevision: 1, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .11 } }] };
    const accepted = await command(f.app, 'changes.apply', edit, { token, key }); assert.equal(accepted.status, 'ok');
    await command(f.app, 'policy.set', { projectId: p.id, paused: true });
    assert.equal((await command(f.app, 'changes.apply', edit, { token, key })).operationId, accepted.operationId);
    assert.equal((await command(f.app, 'changes.apply', { ...edit, expectedRevision: 2 }, { token })).error.code, 'AI_PAUSED');
    assert.equal((await command(f.app, 'policy.set', { projectId: p.id, paused: false }, { token })).error.code, 'FORBIDDEN');
    await command(f.app, 'policy.set', { projectId: p.id, paused: false });
    await command(f.app, 'changes.apply', { projectId: p.id, expectedRevision: 2, changes: [{ type: 'locks.set', locks: [{ layerId: 'sparks', field: 'size' }] }] });
    assert.equal((await command(f.app, 'changes.apply', { ...edit, expectedRevision: 3 }, { token })).error.code, 'LOCKED');
    assert.equal((await command(f.app, 'reviews.add', { projectId: p.id, revision: 3, text: 'Pretty', verdict: 'approved' }, { token })).error.code, 'FORBIDDEN');
    await command(f.app, 'actors.revoke', { actorId: actor.data.id });
    assert.equal((await command(f.app, 'changes.apply', edit, { token, key })).error.code, 'UNAUTHORIZED');
  } finally { await f.close(); }
});

test('candidate job uses accepted snapshot and exposes hash-verified artefacts only to authorized actors', async () => {
  const f = await fixture();
  try {
    const p = await created(f.app);
    const build = await command(f.app, 'candidate.build', { projectId: p.id, revision: 1 }); assert.equal(build.status, 'accepted');
    await command(f.app, 'changes.apply', { projectId: p.id, expectedRevision: 1, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .1 } }] });
    await f.app.studio.drainJobs();
    const job = (await command(f.app, 'jobs.get', { jobId: build.data.id })).data;
    assert.equal(job.status, 'succeeded', JSON.stringify(job.error)); assert.equal(job.revision, 1); assert.ok(job.artifacts.some((a: any) => a.name === 'candidate.zip'));
    const reader = (await command(f.app, 'actors.create', { name: 'Reader', projectIds: [p.id], scopes: ['jobs', 'artifacts'] })).data;
    assert.equal((await command(f.app, 'jobs.get', { jobId: job.id }, { token: reader.token })).status, 'ok');
    assert.equal((await command(f.app, 'jobs.cancel', { jobId: job.id }, { token: reader.token })).error.code, 'FORBIDDEN');
    const artifact = job.artifacts.find((a: any) => a.name === 'candidate.zip');
    const download = await f.app.inject({ url: artifact.downloadUrl, headers: { host, authorization: 'Bearer ' + reader.token } });
    assert.equal(download.statusCode, 200); assert.equal(createHash('sha256').update(download.rawPayload).digest('hex'), artifact.sha256);
    assert.equal((await f.app.inject({ url: artifact.downloadUrl, headers: { host } })).statusCode, 401);
    assert.equal((await command(f.app, 'preview.request', { projectId: p.id, revision: 1 })).error.code, 'CAPABILITY_UNAVAILABLE');
  } finally { await f.close(); }
});

test('portable project validates manifest and rejects unsafe ZIP entries', async () => {
  const f = await fixture();
  try {
    const p = await created(f.app);
    const exported = await command(f.app, 'projects.export', { projectId: p.id, revision: 1 });
    const download = await f.app.inject({ url: exported.data.artifact.downloadUrl, headers: { host, authorization: 'Bearer ' + f.app.studio.config.ownerToken } });
    const imported = await command(f.app, 'projects.import', { bundleBase64: download.rawPayload.toString('base64') });
    assert.equal(imported.status, 'ok', JSON.stringify(imported.error)); assert.deepEqual(imported.data.document, p.document); assert.notEqual(imported.data.id, p.id);
    const unsafe = zipSync({ '../outside.txt': strToU8('bad'), 'project.json': strToU8(JSON.stringify(p.document)), 'manifest.json': strToU8('{}') });
    assert.equal((await command(f.app, 'projects.import', { bundleBase64: Buffer.from(unsafe).toString('base64') })).error.code, 'UNSAFE_BUNDLE');
  } finally { await f.close(); }
});

test('pause during async rendering prevents publication; blocked work can be cancelled', async () => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(r => { entered = r; });
  const proceed = new Promise<void>(r => { release = r; });
  const f = await fixture(async () => { entered(); await proceed; return { files: [{ name: 'preview.png', data: new Uint8Array([1, 2, 3]) }] }; });
  try {
    const p = await created(f.app);
    const actor = (await command(f.app, 'actors.create', { name: 'Render', projectIds: [p.id], scopes: ['read', 'render', 'jobs'] })).data;
    const request = await command(f.app, 'preview.request', { projectId: p.id, revision: 1 }, { token: actor.token });
    await started;
    await command(f.app, 'policy.set', { projectId: p.id, paused: true }); release(); await f.app.studio.drainJobs();
    const blocked = (await command(f.app, 'jobs.get', { jobId: request.data.id })).data;
    assert.equal(blocked.status, 'blocked'); assert.equal(blocked.error.code, 'AI_PAUSED'); assert.equal(blocked.artifacts.length, 0);
    await command(f.app, 'jobs.cancel', { jobId: request.data.id });
    assert.equal((await command(f.app, 'jobs.get', { jobId: request.data.id })).data.status, 'cancelled');
  } finally { release(); await f.close(); }
});

test('restart recovers accepted and interrupted local render jobs without duplicate operation', async () => {
  const f = await fixture(async (_document, options) => {
    await new Promise<void>((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    return { files: [] };
  });
  let app = f.app;
  try {
    const p = await created(app), key = randomUUID();
    const input = { projectId: p.id, revision: 1, time: .4 };
    const accepted = app.studio.dispatch('owner', { operation: 'preview.request', input, idempotencyKey: key });
    assert.equal(accepted.status, 'accepted'); const jobId = (accepted.data as any).id;
    // Stop before the deferred worker takes the committed job.
    await app.close();
    const seen: any[] = [];
    app = await createApp({ dataDir: f.dataDir, render: async (document, options) => { seen.push({ document, time: options.time }); return { files: [{ name: 'preview.png', data: new Uint8Array([4, 5, 6]) }] }; } });
    await app.studio.drainJobs();
    let job = (await command(app, 'jobs.get', { jobId })).data; assert.equal(job.status, 'succeeded'); assert.equal(seen.length, 1); assert.equal(seen[0].time, .4); assert.deepEqual(seen[0].document, p.document);
    const retry = await command(app, 'preview.request', input, { key }); assert.equal(retry.operationId, accepted.operationId); assert.equal(retry.data.id, jobId);
    assert.equal((await command(app, 'jobs.list', { projectId: p.id })).data.items.length, 1);
    await app.close();
    let entered!: () => void; const start = new Promise<void>(r => { entered = r; });
    app = await createApp({ dataDir: f.dataDir, render: async (_document, options) => {
      entered(); await new Promise<void>((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); return { files: [] };
    } });
    const second = await command(app, 'preview.request', input); await start;
    await app.close();
    app = await createApp({ dataDir: f.dataDir, render: async () => ({ files: [{ name: 'preview.png', data: new Uint8Array([7, 8, 9]) }] }) });
    await app.studio.drainJobs(); job = (await command(app, 'jobs.get', { jobId: second.data.id })).data;
    assert.equal(job.status, 'succeeded'); assert.equal(job.artifacts.filter((a: any) => a.name === 'preview.png').length, 1);
  } finally { await app.close(); rmSync(f.dataDir, { recursive: true, force: true }); }
});

test('cancelling an active render prevents a late result from publishing artifacts', async () => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(r => { entered = r; }), wait = new Promise<void>(r => { release = r; });
  const f = await fixture(async () => { entered(); await wait; return { files: [{ name: 'late.png', data: new Uint8Array([1]) }] }; });
  try {
    const p = await created(f.app), request = await command(f.app, 'preview.request', { projectId: p.id, revision: 1 });
    await started; const cancelling = await command(f.app, 'jobs.cancel', { jobId: request.data.id }); assert.equal(cancelling.data.status, 'cancelling'); release(); await f.app.studio.drainJobs();
    const job = (await command(f.app, 'jobs.get', { jobId: request.data.id })).data; assert.equal(job.status, 'cancelled'); assert.deepEqual(job.artifacts, []);
    assert.equal((await command(f.app, 'artifacts.list', { projectId: p.id })).data.items.length, 0);
  } finally { release(); await f.close(); }
});

test('data store admits only one active writer', async () => {
  const f = await fixture();
  try { await assert.rejects(createApp({ dataDir: f.dataDir }), /właściciela zapisu/); }
  finally { await f.close(); }
});

test('owner can stop gracefully; replay after restart does not stop a new session', async () => {
  const f = await fixture(); let app = f.app;
  try {
    const project = await created(app), reader = (await command(app, 'actors.create', { name: 'Reader', projectIds: [project.id], scopes: ['read'] })).data;
    const key = randomUUID();
    const denied = await app.inject({ method: 'POST', url: '/api/service/stop', headers: { host, authorization: 'Bearer ' + reader.token }, payload: { idempotencyKey: key } }); assert.equal(denied.statusCode, 403);
    const stopped = await app.inject({ method: 'POST', url: '/api/service/stop', headers: { host, authorization: 'Bearer ' + app.studio.config.ownerToken }, payload: { idempotencyKey: key } });
    assert.equal(stopped.json().data.stopping, true); await app.close();
    app = await createApp({ dataDir: f.dataDir });
    const replay = await app.inject({ method: 'POST', url: '/api/service/stop', headers: { host, authorization: 'Bearer ' + app.studio.config.ownerToken }, payload: { idempotencyKey: key } });
    assert.equal(replay.json().operationId, stopped.json().operationId);
    await new Promise<void>(r => setImmediate(r));
    assert.equal((await app.inject({ url: '/api/health', headers: { host } })).statusCode, 200);
  } finally { await app.close(); rmSync(f.dataDir, { recursive: true, force: true }); }
});

test('pagination cursors do not duplicate revisions when a new revision arrives', async () => {
  const f = await fixture();
  try {
    const p = await created(f.app);
    for (let revision = 1; revision <= 3; revision++) await command(f.app, 'changes.apply', { projectId: p.id, expectedRevision: revision, changes: [{ type: 'project.set', values: { seed: revision } }] });
    const first = (await command(f.app, 'revisions.list', { projectId: p.id, limit: 2 })).data;
    assert.deepEqual(first.items.map((p: any) => p.revision), [4, 3]);
    await command(f.app, 'changes.apply', { projectId: p.id, expectedRevision: 4, changes: [{ type: 'project.set', values: { seed: 5 } }] });
    const second = (await command(f.app, 'revisions.list', { projectId: p.id, limit: 2, cursor: first.nextCursor })).data;
    assert.deepEqual(second.items.map((p: any) => p.revision), [2, 1]);
  } finally { await f.close(); }
});
