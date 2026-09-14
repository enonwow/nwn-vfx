import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type StudioApp } from '../apps/service/src/app.js';
import { hash } from '../apps/service/src/store.js';
import { orientationTexture } from './fixtures/rgba-texture.js';

const host = '127.0.0.1:4317', origin = 'http://' + host;
type Grant = { actorId: string; token: string; viewSessionId: string; projectId: string; expiresAt: string; scopes: string[]; projectIds: string[] };
async function fixture(render?: Parameters<typeof createApp>[0]['render']) {
  const dataDir = mkdtempSync(join(tmpdir(), 'nwn-vfx-webmcp-')), app = await createApp({ dataDir, render });
  return { app, dataDir, close: async () => { await app.close(); rmSync(dataDir, { recursive: true, force: true }); } };
}
async function owner(app: StudioApp, operation: string, input: Record<string, unknown> = {}) {
  return (await app.inject({ method: 'POST', url: '/api/commands', headers: { host, authorization: 'Bearer ' + app.studio.config.ownerToken }, payload: { operation, input, idempotencyKey: randomUUID() } })).json();
}
async function browser(app: StudioApp) {
  const result = await app.inject({ url: '/api/session', headers: { host, referer: origin + '/', 'sec-fetch-site': 'same-origin' } });
  assert.equal(result.statusCode, 200); return String(result.headers['set-cookie']).split(';')[0];
}
const browserHeaders = (cookie: string) => ({ host, origin, cookie, 'sec-fetch-site': 'same-origin' });
const grantHeaders = (cookie: string, grant: Grant) => ({ ...browserHeaders(cookie), 'x-nwn-webmcp-session': grant.token, 'x-nwn-view-session': grant.viewSessionId });
async function grant(app: StudioApp, cookie: string, projectId: string, viewSessionId: string = randomUUID()) {
  const result = await app.inject({ method: 'POST', url: '/api/webmcp/sessions', headers: browserHeaders(cookie), payload: { viewSessionId, projectId } });
  assert.equal(result.statusCode, 200, result.body); return result.json() as Grant;
}
async function command(app: StudioApp, cookie: string, session: Grant, operation: string, input: Record<string, unknown> = {}, idempotencyKey = randomUUID()) {
  return (await app.inject({ method: 'POST', url: '/api/webmcp/commands', headers: grantHeaders(cookie, session), payload: { operation, input, idempotencyKey } })).json();
}
async function setup(app: StudioApp) {
  const project = (await owner(app, 'projects.create', { name: 'WebMCP', preset: 'coil' })).data, cookie = await browser(app), session = await grant(app, cookie, project.id);
  return { project, cookie, session };
}

test('WebMCP reads candidate-scoped native dependencies without granting native execution or proof', async () => {
  const f = await fixture();
  try {
    const { project, cookie, session } = await setup(f.app);
    const built = await owner(f.app, 'candidate.build', { projectId: project.id, revision: 1 });
    assert.equal(built.status, 'accepted'); await f.app.studio.drainJobs();
    const result = await command(f.app, cookie, session, 'native.test.status', { candidateId: built.data.id });
    assert.equal(result.status, 'ok', JSON.stringify(result.error));
    assert.equal(result.data.state, 'awaiting_qualified_runner');
    assert.equal(result.data.nativeVerified, false); assert.deepEqual(result.data.nativeArtifacts, []);
    const other = (await owner(f.app, 'projects.create', { preset: 'empty' })).data;
    const foreign = await owner(f.app, 'candidate.build', { projectId: other.id, revision: 1 });
    await f.app.studio.drainJobs();
    assert.equal((await command(f.app, cookie, session, 'native.test.status', { candidateId: foreign.data.id })).error.code, 'FORBIDDEN');
    assert.equal((await command(f.app, cookie, session, 'native.test.request', { candidateId: built.data.id, profileId: 'external' })).error.code, 'FORBIDDEN');
    assert.equal((await command(f.app, cookie, session, 'native.test.status', { candidateId: built.data.id, nativeVerified: true })).error.code, 'VALIDATION_ERROR');
  } finally { await f.close(); }
});

test('WebMCP credentials require the exact owner cookie and view, cannot act as bearer or fall back to owner', async () => {
  const f = await fixture();
  try {
    const { project, cookie, session } = await setup(f.app), otherCookie = await browser(f.app);
    assert.notEqual(session.actorId, 'owner'); assert.equal(f.app.studio.actor(session.actorId).kind, 'agent');
    assert.ok(Date.parse(session.expiresAt) <= Date.now() + 1800000); assert.deepEqual(session.projectIds, [project.id]);
    assert.ok(!session.scopes.includes('*')); assert.ok(!session.scopes.includes('import'));
    assert.equal((await command(f.app, cookie, session, 'projects.inspect', { projectId: project.id })).status, 'ok');
    for (const headers of [
      { ...grantHeaders(cookie, session), cookie: '' },
      grantHeaders(otherCookie, session),
      { ...grantHeaders(cookie, session), 'x-nwn-view-session': randomUUID() },
      { ...grantHeaders(cookie, session), 'x-nwn-webmcp-session': 'x'.repeat(43) },
      { ...browserHeaders(cookie), 'x-nwn-view-session': session.viewSessionId },
      { ...grantHeaders(cookie, session), authorization: 'Bearer ' + f.app.studio.config.ownerToken },
    ]) {
      const response = await f.app.inject({ url: '/api/webmcp/session', headers });
      assert.equal(response.statusCode, 401);
    }
    const bearer = await f.app.inject({ method: 'POST', url: '/api/commands', headers: { host, authorization: 'Bearer ' + session.token }, payload: { operation: 'projects.list', input: {} } });
    assert.equal(bearer.statusCode, 401);
    const fallback = await f.app.inject({ method: 'POST', url: '/api/commands', headers: grantHeaders(cookie, session), payload: { operation: 'policy.set', input: { projectId: project.id, paused: false }, idempotencyKey: randomUUID() } });
    assert.equal(fallback.statusCode, 403);
    const safe = await f.app.inject({ url: '/api/webmcp/session', headers: grantHeaders(cookie, session) });
    assert.equal(safe.json().data.actorId, session.actorId); assert.ok(!safe.body.includes(session.token)); assert.ok(!safe.body.includes(f.app.studio.config.ownerToken));
    const bootstrap = await f.app.inject({ url: '/api/session', headers: { ...grantHeaders(cookie, session), referer: origin + '/', 'x-nwn-webmcp-session': 'x'.repeat(43) } });
    assert.equal(bootstrap.statusCode, 401); assert.equal(bootstrap.headers['set-cookie'], undefined);
  } finally { await f.close(); }
});

test('only owner browser grants a session; input, origin, administrative actions and actor spoofing are rejected', async () => {
  const f = await fixture();
  try {
    const { project, cookie, session } = await setup(f.app), body = { projectId: project.id, viewSessionId: randomUUID() };
    for (const payload of [{ ...body, actorId: 'owner' }, { ...body, scopes: ['*'] }, { ...body, expiresAt: '2099-01-01' }, { ...body, projectId: '../secret' }, { projectId: project.id }]) {
      assert.equal((await f.app.inject({ method: 'POST', url: '/api/webmcp/sessions', headers: browserHeaders(cookie), payload })).statusCode, 400);
    }
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/webmcp/sessions', headers: { host, authorization: 'Bearer ' + f.app.studio.config.ownerToken }, payload: body })).statusCode, 401);
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/webmcp/sessions', headers: { ...browserHeaders(cookie), origin: 'https://evil.example' }, payload: body })).statusCode, 403);
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/webmcp/sessions', headers: grantHeaders(cookie, session), payload: body })).statusCode, 403);
    for (const operation of ['actors.list', 'actors.create', 'actors.revoke', 'policy.set', 'revisions.restore', 'service.stop', 'projects.import']) {
      assert.equal((await command(f.app, cookie, session, operation)).error.code, 'FORBIDDEN');
    }
    const forged = await f.app.inject({ method: 'POST', url: '/api/webmcp/commands', headers: grantHeaders(cookie, session), payload: { operation: 'projects.inspect', input: { projectId: project.id }, actorId: 'owner' } });
    assert.equal(forged.json().error.code, 'VALIDATION_ERROR');
  } finally { await f.close(); }
});

test('WebMCP scopes and project grants survive narrowing and rotation without escalation', async () => {
  const f = await fixture();
  try {
    const { project, cookie, session } = await setup(f.app), other = (await owner(f.app, 'projects.create', { name: 'Private' })).data;
    assert.equal((await command(f.app, cookie, session, 'projects.inspect', { projectId: other.id })).error.code, 'FORBIDDEN');
    assert.deepEqual((await command(f.app, cookie, session, 'projects.list')).data.items.map((p: any) => p.id), [project.id]);
    const fork = await command(f.app, cookie, session, 'projects.fork', { projectId: project.id, revision: 1, name: 'My variant' });
    assert.equal(fork.status, 'ok'); assert.equal((await command(f.app, cookie, session, 'projects.inspect', { projectId: fork.data.id })).status, 'ok');
    const actor = f.app.studio.actor(session.actorId); actor.scopes = ['read'];
    f.app.studio.db.prepare('UPDATE actors SET value=? WHERE id=?').run(JSON.stringify(actor), actor.id);
    assert.equal((await command(f.app, cookie, session, 'changes.apply', { projectId: project.id, expectedRevision: 1, changes: [{ type: 'project.set', values: { seed: 23 } }] })).error.code, 'FORBIDDEN');
    const rotated = await grant(f.app, cookie, project.id, session.viewSessionId);
    assert.deepEqual(rotated.scopes, ['read']); assert.notEqual(rotated.token, session.token);
    assert.equal((await command(f.app, cookie, session, 'projects.inspect', { projectId: project.id })).error.code, 'UNAUTHORIZED');
    assert.equal((await command(f.app, cookie, rotated, 'projects.inspect', { projectId: project.id })).status, 'ok');
    assert.equal((await command(f.app, cookie, rotated, 'projects.create', { name: 'No escalation' })).error.code, 'FORBIDDEN');
  } finally { await f.close(); }
});

test('WebMCP dispatch preserves durable idempotency, revision conflicts, owner locks and AI pause', async () => {
  const f = await fixture();
  try {
    const { project, cookie, session } = await setup(f.app), key = randomUUID();
    const input = { projectId: project.id, expectedRevision: 1, changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .17 } }] };
    const applied = await command(f.app, cookie, session, 'changes.apply', input, key); assert.equal(applied.status, 'ok');
    const record = (await owner(f.app, 'operations.get', { operationId: applied.operationId })).data; assert.equal(record.actorId, session.actorId);
    assert.equal((await command(f.app, cookie, session, 'changes.apply', input, key)).operationId, applied.operationId);
    assert.equal((await command(f.app, cookie, session, 'changes.apply', input)).error.code, 'REVISION_CONFLICT');
    await owner(f.app, 'policy.set', { projectId: project.id, paused: true });
    assert.equal((await command(f.app, cookie, session, 'changes.apply', { ...input, expectedRevision: 2 })).error.code, 'AI_PAUSED');
    assert.equal((await command(f.app, cookie, session, 'changes.apply', input, key)).operationId, applied.operationId);
    assert.equal((await command(f.app, cookie, session, 'policy.set', { projectId: project.id, paused: false })).error.code, 'FORBIDDEN');
    await owner(f.app, 'policy.set', { projectId: project.id, paused: false });
    await owner(f.app, 'changes.apply', { projectId: project.id, expectedRevision: 2, changes: [{ type: 'locks.set', locks: [{ layerId: 'sparks', field: 'size' }] }] });
    assert.equal((await command(f.app, cookie, session, 'changes.apply', { ...input, expectedRevision: 3 })).error.code, 'LOCKED');
    assert.equal((await command(f.app, cookie, session, 'reviews.add', { projectId: project.id, revision: 3, text: 'Agent cannot approve', verdict: 'approved' })).error.code, 'FORBIDDEN');
  } finally { await f.close(); }
});

test('WebMCP imports project-scoped PNG through edit rights and preserves pause, history and dependencies', async () => {
  const f = await fixture();
  try {
    const {project,cookie,session}=await setup(f.app),bytes=orientationTexture(8),assetId=hash(bytes),key=randomUUID();
    const input={projectId:project.id,expectedRevision:1,fileName:'webmcp-quadrants.png',pngBase64:Buffer.from(bytes).toString('base64')};
    const imported=await command(f.app,cookie,session,'assets.import',input,key);
    assert.equal(imported.status,'ok',JSON.stringify(imported.error));assert.equal(imported.data.assetId,assetId);
    assert.equal((await command(f.app,cookie,session,'assets.import',input,key)).operationId,imported.operationId);
    assert.equal((await command(f.app,cookie,session,'assets.import',input)).error.code,'REVISION_CONFLICT');
    const listed=await command(f.app,cookie,session,'assets.list',{projectId:project.id,revision:2});
    assert.equal(listed.data.items[0].id,assetId);assert.equal(listed.data.items[0].pngBase64,undefined);
    const image=await command(f.app,cookie,session,'assets.get',{projectId:project.id,revision:2,assetId});
    assert.equal(hash(Buffer.from(image.data.pngBase64,'base64')),assetId);
    const assigned=await command(f.app,cookie,session,'changes.apply',{projectId:project.id,expectedRevision:2,changes:[{type:'layer.set',layerId:'smoke',values:{texture:`asset:${assetId}`,blend:'normal',midColor:'#aacc88',midAlpha:.6,midSize:.3,midPercent:.4}}]});
    assert.equal(assigned.status,'ok',JSON.stringify(assigned.error));
    assert.equal((await owner(f.app,'revisions.list',{projectId:project.id})).data.items[0].actorId,session.actorId);
    await owner(f.app,'policy.set',{projectId:project.id,paused:true});
    assert.equal((await command(f.app,cookie,session,'assets.import',{...input,expectedRevision:3})).error.code,'AI_PAUSED');
    assert.equal((await command(f.app,cookie,session,'assets.get',{projectId:project.id,assetId})).status,'ok');
    const foreign=(await owner(f.app,'projects.create',{preset:'empty'})).data;
    assert.equal((await command(f.app,cookie,session,'assets.get',{projectId:foreign.id,assetId})).error.code,'FORBIDDEN');
  }finally{await f.close();}
});

test('WebMCP retrieves verified artifact chunks; malformed ranges, foreign grants, corruption and revocation fail', async () => {
  const f = await fixture();
  try {
    const { project, cookie, session } = await setup(f.app);
    const result = await command(f.app, cookie, session, 'candidate.build', { projectId: project.id, revision: 1 }); assert.equal(result.status, 'accepted'); await f.app.studio.drainJobs();
    const job = (await command(f.app, cookie, session, 'jobs.get', { jobId: result.data.id })).data; assert.equal(job.status, 'succeeded');
    const artifact = job.artifacts.find((a: any) => a.name === 'candidate.zip'), headers = grantHeaders(cookie, session);
    const download = await f.app.inject({ url: artifact.downloadUrl, headers }); assert.equal(download.statusCode, 200); assert.equal(hash(download.rawPayload), artifact.sha256);
    const parts: Buffer[] = []; let offset = 0;
    while (true) {
      const response = await f.app.inject({ url: `/api/webmcp/artifacts/${artifact.id}?offset=${offset}&length=8192`, headers });
      assert.equal(response.statusCode, 200); const chunk = response.json().data, bytes = Buffer.from(chunk.base64, 'base64');
      assert.equal(chunk.offset, offset); assert.equal(chunk.length, bytes.length); assert.equal(hash(bytes), chunk.chunkSha256); assert.equal(chunk.artifact.sha256, artifact.sha256); parts.push(bytes);
      if (chunk.nextOffset === null) break; offset = chunk.nextOffset;
    }
    assert.deepEqual(Buffer.concat(parts), download.rawPayload);
    const tail = (await f.app.inject({ url: `/api/webmcp/artifacts/${artifact.id}?offset=${artifact.size}`, headers })).json().data; assert.equal(tail.length, 0); assert.equal(tail.nextOffset, null);
    for (const query of ['offset=-1', 'offset=1.2', 'offset=abc', 'offset=9007199254740992', `offset=${artifact.size + 1}`, 'length=0', 'length=262145', 'length=3&length=4', 'token=x']) {
      assert.equal((await f.app.inject({ url: `/api/webmcp/artifacts/${artifact.id}?${query}`, headers })).statusCode, 400);
    }
    const other = (await owner(f.app, 'projects.create', { name: 'Unrelated' })).data, otherSession = await grant(f.app, cookie, other.id);
    assert.equal((await f.app.inject({ url: `/api/webmcp/artifacts/${artifact.id}`, headers: grantHeaders(cookie, otherSession) })).statusCode, 403);
    assert.equal((await f.app.inject({ url: artifact.downloadUrl, headers: { ...browserHeaders(cookie), 'x-nwn-view-session': session.viewSessionId } })).statusCode, 401);
    const row = f.app.studio.db.prepare('SELECT file_path FROM artifacts WHERE id=?').get(artifact.id) as { file_path: string }; writeFileSync(row.file_path, 'tampered');
    assert.equal((await f.app.inject({ url: `/api/webmcp/artifacts/${artifact.id}`, headers })).json().error.code, 'ARTIFACT_HASH_MISMATCH');
    const revoked = await f.app.inject({ method: 'POST', url: '/api/webmcp/revoke', headers: browserHeaders(cookie), payload: { viewSessionId: session.viewSessionId } }); assert.equal(revoked.json().revoked, true);
    assert.equal((await command(f.app, cookie, session, 'projects.inspect', { projectId: project.id })).error.code, 'UNAUTHORIZED');
    assert.equal((await f.app.inject({ url: artifact.downloadUrl, headers })).statusCode, 401);
    assert.equal((await f.app.inject({ url: `/api/webmcp/artifacts/${artifact.id}`, headers })).statusCode, 401);
  } finally { await f.close(); }
});

test('WebMCP grants persist through restart but expire with either grant or owner cookie', async () => {
  const f = await fixture(); let app = f.app;
  try {
    const { project, cookie, session } = await setup(app); await app.close(); app = await createApp({ dataDir: f.dataDir });
    assert.equal((await command(app, cookie, session, 'projects.inspect', { projectId: project.id })).status, 'ok');
    app.studio.db.prepare('UPDATE webmcp_sessions SET expires=? WHERE actor_id=?').run(Date.now() - 1, session.actorId);
    assert.equal((await command(app, cookie, session, 'projects.inspect', { projectId: project.id })).error.code, 'UNAUTHORIZED');
    assert.throws(() => app.studio.actor(session.actorId), /wygasła/);
    const fresh = await grant(app, cookie, project.id); app.studio.db.prepare('UPDATE sessions SET expires=?').run(Date.now() - 1);
    assert.equal((await command(app, cookie, fresh, 'projects.inspect', { projectId: project.id })).error.code, 'UNAUTHORIZED');
    assert.throws(() => app.studio.actor(fresh.actorId), /wygasła/);
  } finally { await app.close(); rmSync(f.dataDir, { recursive: true, force: true }); }
});

test('expiry during an accepted WebMCP render prevents publishing artifacts', async () => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(r => { entered = r; }), proceed = new Promise<void>(r => { release = r; });
  const f = await fixture(async () => { entered(); await proceed; return { files: [{ name: 'preview.png', data: new Uint8Array([1, 2, 3]) }] }; });
  try {
    const { project, cookie, session } = await setup(f.app), result = await command(f.app, cookie, session, 'preview.request', { projectId: project.id, revision: 1 });
    assert.equal(result.status, 'accepted'); await started;
    f.app.studio.db.prepare('UPDATE webmcp_sessions SET expires=? WHERE actor_id=?').run(Date.now() - 1, session.actorId);
    release(); await f.app.studio.drainJobs();
    const job = (await owner(f.app, 'jobs.get', { jobId: result.data.id })).data;
    assert.equal(job.error.code, 'UNAUTHORIZED'); assert.deepEqual(job.artifacts, []);
  } finally { release(); await f.close(); }
});

test('WebMCP view access enforces current read/edit scopes, project boundaries and human pause', async () => {
  const f = await fixture();
  try {
    const { project, cookie, session } = await setup(f.app), other = (await owner(f.app, 'projects.create', { name: 'Private view' })).data;
    const probe = async (payload: unknown, headers = grantHeaders(cookie, session)) => f.app.inject({ method: 'POST', url: '/api/webmcp/view-access', headers, payload: payload as any });
    assert.equal((await probe({ projectId: project.id, mode: 'read' })).json().status, 'ok');
    assert.equal((await probe({ projectId: project.id, mode: 'edit' })).json().status, 'ok');
    assert.equal((await probe({ projectId: other.id, mode: 'read' })).statusCode, 403);
    for (const payload of [{ projectId: project.id, mode: ['read'] }, { projectId: project.id, mode: 'owner' }, { projectId: project.id, mode: 'read', actorId: 'owner' }]) {
      assert.equal((await probe(payload)).json().error.code, 'VALIDATION_ERROR');
    }
    await owner(f.app, 'policy.set', { projectId: project.id, paused: true });
    assert.equal((await probe({ projectId: project.id, mode: 'edit' })).json().error.code, 'AI_PAUSED');
    assert.equal((await probe({ projectId: project.id, mode: 'read' })).json().status, 'ok');
    await owner(f.app, 'policy.set', { projectId: project.id, paused: false });
    const actor = f.app.studio.actor(session.actorId); actor.scopes = ['read'];
    f.app.studio.db.prepare('UPDATE actors SET value=? WHERE id=?').run(JSON.stringify(actor), actor.id);
    assert.equal((await probe({ projectId: project.id, mode: 'edit' })).json().error.code, 'FORBIDDEN');
    assert.equal((await probe({ projectId: project.id, mode: 'read' })).json().status, 'ok');
    actor.scopes = ['edit']; f.app.studio.db.prepare('UPDATE actors SET value=? WHERE id=?').run(JSON.stringify(actor), actor.id);
    assert.equal((await probe({ projectId: project.id, mode: 'read' })).json().error.code, 'FORBIDDEN');
    assert.equal((await probe({ projectId: project.id, mode: 'edit' })).json().error.code, 'FORBIDDEN');
    await owner(f.app, 'actors.revoke', { actorId: session.actorId });
    assert.equal((await probe({ projectId: project.id, mode: 'read' })).statusCode, 401);
  } finally { await f.close(); }
});
