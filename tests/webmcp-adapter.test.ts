import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CONTRACT_VERSION, applyChanges, changedFields, makeDocument, makeMeshLayer, type Result } from '../packages/core/src/model.js';
import { prepareObjImport } from '../packages/core/src/obj.js';
import { operationSchemas } from '../packages/contracts/src/schema.js';
import { toolsForProfile, webMCPInputSchemas } from '../apps/web/src/webmcp-schemas.js';
import { createStudioWebMCPTools, detectWebMCP, setupStudioWebMCP, verifyArtifactChunk,
  WEBMCP_OPERATIONS, type WebMCPTool, type StudioWebMCPOptions, type StudioViewContext, type ModelContextRegistrationAPI } from '../apps/web/src/webmcp.js';

const date = '2026-09-05T15:00:00.000Z';
const project = { id: 'project-a', revision: 1, document: makeDocument(), createdAt: date, updatedAt: date };
const grant = { token: 'secret-test-grant', actorId: 'agent-a', expiresAt: '2099-01-01T00:00:00.000Z', viewSessionId: 'view-a', projectId: project.id };
const result = (data: unknown, status: Result['status'] = 'ok'): Result => ({ contractVersion: CONTRACT_VERSION, requestId: 'request-test', status, data, diagnostics: [] });
const response = (value: Result, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const failed = (code: string): Result => ({ contractVersion: CONTRACT_VERSION, requestId: 'server-error', operationId: 'operation-error', status: 'failed', error: { code, message: code, retryable: false }, diagnostics: [] });
function setup(fetcher?: typeof fetch) {
  let currentGrant: typeof grant | null = grant;
  let context: StudioViewContext = { viewSessionId: grant.viewSessionId, projectId: project.id, revision: 1, viewRevision: 2, draftDirty: false,
    draft: project.document, selectedLayerId: 'sparks', time: 0, playing: false };
  let sets = 0, opens = 0;
  const calls: { path: string; init?: RequestInit }[] = [];
  const options: StudioWebMCPOptions = { getGrant: () => currentGrant, fetch: async (path, init) => {
    calls.push({ path: String(path), init });
    if (fetcher) return fetcher(path, init);
    if (String(path).endsWith('/view-access')) return response(result(JSON.parse(String(init?.body))));
    return response(result({ actorId: grant.actorId, viewSessionId: grant.viewSessionId, projectId: project.id, projectIds: [project.id, 'fork-a'], scopes: ['read', 'edit'], expiresAt: grant.expiresAt }));
  }, view: { inspect: () => context, set: input => { sets++; context = { ...context, time: input.time ?? context.time, viewRevision: context.viewRevision + 1 }; return context; },
    open: target => { opens++; context = { ...context, projectId: target.id, revision: target.revision, draft: target.document, viewRevision: context.viewRevision + 1 }; return context; } } };
  const tools = createStudioWebMCPTools(options);
  return { options, calls, tools, find: (name: string) => tools.find(tool => tool.name === 'studio.' + name)!,
    grant: (value: typeof grant | null) => { currentGrant = value; }, update: (value: Partial<StudioViewContext>) => { context = { ...context, ...value }; },
    counts: () => ({ sets, opens }), context: () => context };
}

test('discovery exposes the shared schemas without administrator tools and does not need a grant', async () => {
  const f = setup(); f.grant(null);
  for (const operation of WEBMCP_OPERATIONS) {
    const schema = f.find(operation).inputSchema as any;
    assert.equal(schema.required.includes('idempotencyKey'), operationSchemas[operation].mutates);
    assert.deepEqual(schema, webMCPInputSchemas(operationSchemas)[`studio.${operation}`]);
  }
  for (const forbidden of ['actors.create', 'actors.revoke', 'policy.set', 'revisions.restore', 'projects.import', 'native.test.request']) assert.equal(f.find(forbidden), undefined);
  assert.equal((await f.find('connection.inspect').execute({})).error?.code, 'WEBMCP_NOT_CONNECTED');
  assert.equal((await f.find('projects.inspect').execute({ viewSessionId: 'view-a', input: { projectId: project.id } })).error?.code, 'WEBMCP_NOT_CONNECTED');
  assert.equal(f.calls.length, 0);
});

test('scoped invocation preserves result identity and caller idempotency without owner fallback', async () => {
  const reply = { ...result(project), operationId: 'operation-committed' };
  const f = setup(async () => response(reply));
  const args = { viewSessionId: 'view-a', input: { projectId: 'project-a', expectedRevision: 1,
    changes: [{ type: 'layer.set', layerId: 'sparks', values: { count: 25 } }] }, idempotencyKey: 'caller-stable-key' };
  // Test with a mutation whose exact result is the project DTO.
  const forkArgs = { viewSessionId: 'view-a', input: { projectId: 'project-a', name: 'fork' }, idempotencyKey: args.idempotencyKey };
  assert.deepEqual(await f.find('projects.fork').execute(forkArgs), reply);
  assert.deepEqual(await f.find('projects.fork').execute(forkArgs), reply);
  for (const call of f.calls) {
    assert.equal(call.path, '/api/webmcp/commands');
    assert.equal(call.init?.credentials, 'same-origin');
    const headers = new Headers(call.init?.headers);
    assert.equal(headers.get('X-NWN-WebMCP-Session'), grant.token);
    assert.equal(headers.get('X-NWN-View-Session'), grant.viewSessionId);
    assert.equal(headers.get('Authorization'), null);
    assert.equal(JSON.parse(String(call.init?.body)).idempotencyKey, args.idempotencyKey);
  }
  const requests = f.calls.length;
  assert.equal((await f.find('changes.apply').execute({ ...args, idempotencyKey: undefined })).error?.code, 'INVALID_INPUT');
  assert.equal((await f.find('changes.apply').execute({ ...args, actorId: 'owner' })).error?.code, 'INVALID_INPUT');
  assert.equal((await f.find('changes.apply').execute({ ...args, viewSessionId: 'other-view' })).error?.code, 'VIEW_SESSION_MISMATCH');
  assert.equal(f.calls.length, requests);
});

test('OBJ WebMCP preview and import share the schema, explicit source and limited grant while retaining the tab draft', async () => {
  const document = applyChanges(project.document, [{ type: 'layer.add', layer: makeMeshLayer('stone', 'Stone') }], true);
  const objText = 'v 0 0 0\nv 2 0 0\nv 0 1 1\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n';
  const input = { projectId: project.id, expectedRevision: 1, fileName: 'stone.obj', objText, sourceUpAxis: 'z' as const,
    metersPerUnit: 1, normalMode: 'flat' as const, target: { layerId: 'stone' } };
  const prepared = prepareObjImport(document, input), imported = applyChanges(document, prepared.changes, true);
  const preview = { document: imported, diff: changedFields(document, imported), report: prepared.report };
  const mutation = { project: { ...project, revision: 2, document: imported }, report: prepared.report };
  const f = setup(async (_path, init) => response(result(JSON.parse(String(init?.body)).operation === 'meshes.importObj.preview' ? preview : mutation)));
  f.update({ draftDirty: true, draft: document, meshEditorDrafts: { stone: { geometry: { text: '{unfinished', baseline: '{}' } } } });
  const before = structuredClone(f.context());
  assert.deepEqual((await f.find('meshes.importObj.preview').execute({ viewSessionId: 'view-a', input })).data, preview);
  const args = { viewSessionId: 'view-a', input, idempotencyKey: 'webmcp-obj-stable-key' };
  assert.deepEqual((await f.find('meshes.importObj').execute(args)).data, mutation);
  assert.deepEqual((await f.find('meshes.importObj').execute(args)).data, mutation);
  assert.deepEqual(f.calls[1].init?.body, f.calls[2].init?.body);
  assert.deepEqual(f.context(), before); assert.deepEqual(f.counts(), { sets: 0, opens: 0 });
  assert.equal(new Headers(f.calls[1].init?.headers).get('Authorization'), null);
  const count = f.calls.length;
  for (const invalid of [{ ...input, objPath: 'C:/foreign/stone.obj' }, { ...input, normalMode: 'smooth' }, { ...input, sourceUpAxis: undefined }])
    assert.equal((await f.find('meshes.importObj').execute({ ...args, input: invalid })).error?.code, 'INVALID_INPUT');
  assert.equal((await f.find('meshes.importObj').execute({ viewSessionId: 'view-a', input })).error?.code, 'INVALID_INPUT');
  assert.equal(f.calls.length, count);
});

test('OBJ and asset removal WebMCP preserve lock, pause and revision rejection without changing the view', async () => {
  for (const code of ['LOCKED', 'AI_PAUSED', 'REVISION_CONFLICT']) {
    const expected = failed(code), f = setup(async () => response(expected, 409));
    const before = structuredClone(f.context());
    const inputs = {
      'meshes.importObj': { projectId: project.id, expectedRevision: 1, fileName: 'stone.obj', objText: 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3',
        sourceUpAxis: 'z', metersPerUnit: 1, normalMode: 'flat', target: { layerId: 'stone' } },
      'assets.remove': { projectId: project.id, expectedRevision: 1, assetIds: ['a'.repeat(64)] },
    };
    for (const [name, input] of Object.entries(inputs)) assert.deepEqual(await f.find(name).execute({ viewSessionId: 'view-a', input, idempotencyKey: 'obj-asset-test-key' }), expected);
    assert.deepEqual(f.context(), before);
  }
});

test('backend lock, pause, revision conflict and revocation remain domain results with IDs', async () => {
  for (const code of ['LOCKED', 'AI_PAUSED', 'CONFLICT', 'UNAUTHORIZED']) {
    const expected = failed(code), f = setup(async () => response(expected, 403));
    const actual = await f.find('changes.apply').execute({ viewSessionId: 'view-a', input: { projectId: 'project-a', expectedRevision: 1,
      changes: [{ type: 'layer.set', layerId: 'sparks', values: { size: .4 } }] }, idempotencyKey: 'mutation-key' });
    assert.deepEqual(actual, expected);
    assert.equal(f.calls.length, 1);
    assert.equal((await f.find('view.inspect').execute({ viewSessionId: 'view-a' })).error?.code, code);
  }
});

test('accepted jobs return immediately; aborting tool wait never cancels a dispatched operation', async () => {
  const job = { id: 'job-a', jobId: 'job-a', projectId: project.id, revision: 1, actorId: grant.actorId,
    type: 'preview.request', status: 'queued', createdAt: date, updatedAt: date, artifacts: [] };
  const accepted = { ...result(job, 'accepted'), operationId: 'render-operation' };
  const f = setup(async () => response(accepted));
  const args = { viewSessionId: 'view-a', input: { projectId: project.id, revision: 1, format: 'png', camera: {position:[7,-11,6],target:[0,0,2.6],fov:45} }, idempotencyKey: 'render-stable-key' };
  assert.deepEqual(await f.find('preview.request').execute(args), accepted);
  assert.equal(f.calls.length, 1);
  let resolve!: (value: Response) => void;
  const pending = setup(async () => new Promise<Response>(done => { resolve = done; }));
  const controller = new AbortController();
  const waiting = pending.find('preview.request').execute(args, { signal: controller.signal });
  controller.abort();
  const cancelled = await waiting;
  assert.equal(cancelled.error?.code, 'TOOL_WAIT_CANCELLED');
  assert.equal((cancelled.error?.details as any).idempotencyKey, args.idempotencyKey);
  assert.equal(pending.calls[0].init?.signal, undefined);
  resolve(response(accepted));
  await new Promise(done => setImmediate(done));
  assert.equal(pending.calls.length, 1);
  const before = new AbortController(); before.abort();
  await pending.find('preview.request').execute(args, { signal: before.signal });
  assert.equal(pending.calls.length, 1);
});

test('view operations validate the live session and revisions before exposing or changing draft context', async () => {
  const f = setup(); f.update({ draftDirty: true });
  const inspect = await f.find('view.inspect').execute({ viewSessionId: 'view-a' });
  assert.equal((inspect.data as StudioViewContext).draftDirty, true);
  assert.equal(inspect.requestId, 'request-test');
  assert.equal((inspect.data as StudioViewContext).draft?.layers[0].id, 'sparks');
  const args = { viewSessionId: 'view-a', projectId: project.id, expectedRevision: 1, expectedViewRevision: 2, time: .8 };
  assert.equal((await f.find('view.set').execute({ ...args, expectedRevision: 2 })).error?.code, 'CONFLICT');
  assert.equal((await f.find('view.set').execute({ ...args, expectedViewRevision: 1 })).error?.code, 'VIEW_CONFLICT');
  assert.equal((await f.find('view.set').execute({ ...args, projectId: 'project-other' })).error?.code, 'VIEW_PROJECT_MISMATCH');
  assert.equal((await f.find('view.set').execute(args)).status, 'ok');
  assert.equal(f.counts().sets, 1);
  assert.equal(f.context().draftDirty, true);
  f.update({ projectId: 'project-not-authorized' });
  assert.equal((await f.find('view.inspect').execute({ viewSessionId: 'view-a' })).error?.code, 'FORBIDDEN');
});

test('explicit project opening refuses dirty drafts, unauthorized targets and a view changed during fetch', async () => {
  const session = result({ ...grant, token: undefined, projectIds: [project.id, 'fork-a'], scopes: ['read', 'edit'] });
  let changedWhileFetching: (() => void) | undefined;
  const f = setup(async (path, init) => {
    if (String(path).endsWith('/session')) return response(session);
    if (String(path).endsWith('/view-access')) return response(result(JSON.parse(String(init?.body))));
    changedWhileFetching?.();
    return response(result({ ...project, id: 'fork-a' }));
  });
  const args = { viewSessionId: 'view-a', projectId: 'fork-a', expectedViewRevision: 2 };
  f.update({ draftDirty: true });
  assert.equal((await f.find('view.open').execute(args)).error?.code, 'DRAFT_CONFLICT');
  assert.equal(f.calls.some(call => call.path.endsWith('/commands')), false);
  f.update({ draftDirty: false });
  changedWhileFetching = () => f.update({ viewRevision: 3 });
  assert.equal((await f.find('view.open').execute(args)).error?.code, 'VIEW_CONFLICT');
  assert.equal(f.counts().opens, 0);
  changedWhileFetching = undefined;
  assert.equal((await f.find('view.open').execute({ ...args, expectedViewRevision: 3 })).status, 'ok');
  assert.equal(f.context().projectId, 'fork-a');
  assert.equal(f.counts().opens, 1);
  const denied = setup(async (path, init) => response(String(path).endsWith('/session') ? session : String(path).endsWith('/view-access') ? result(JSON.parse(String(init?.body))) : failed('FORBIDDEN')));
  assert.equal((await denied.find('view.open').execute(args)).error?.code, 'FORBIDDEN');
  assert.equal(denied.counts().opens, 0);
});

test('view access enforces live read/edit scopes and AI pause for current and target projects', async () => {
  const session = (scopes: string[]) => result({ viewSessionId: 'view-a', projectIds: [project.id, 'fork-a'], scopes });
  const setArgs = { viewSessionId: 'view-a', projectId: project.id, expectedRevision: 1, expectedViewRevision: 2, time: .5 };
  const openArgs = { viewSessionId: 'view-a', projectId: 'fork-a', expectedViewRevision: 2 };
  const noRead = setup(async () => response(session(['edit'])));
  assert.equal((await noRead.find('view.inspect').execute({ viewSessionId: 'view-a' })).error?.code, 'FORBIDDEN');
  assert.equal(noRead.calls.length, 1);
  const readOnly = setup(async (path, init) => response(String(path).endsWith('/session') ? session(['read']) : result(JSON.parse(String(init?.body)))));
  assert.equal((await readOnly.find('view.inspect').execute({ viewSessionId: 'view-a' })).status, 'ok');
  assert.equal((await readOnly.find('view.set').execute(setArgs)).error?.code, 'FORBIDDEN');
  assert.equal((await readOnly.find('view.open').execute(openArgs)).error?.code, 'FORBIDDEN');
  assert.deepEqual(readOnly.counts(), { sets: 0, opens: 0 });
  const paused = setup(async (path, init) => {
    if (String(path).endsWith('/session')) return response(session(['read', 'edit']));
    const input = JSON.parse(String(init?.body));
    return response(input.mode === 'edit' ? failed('AI_PAUSED') : result(input));
  });
  assert.equal((await paused.find('view.inspect').execute({ viewSessionId: 'view-a' })).status, 'ok');
  assert.equal((await paused.find('view.set').execute(setArgs)).error?.code, 'AI_PAUSED');
  assert.equal((await paused.find('view.open').execute(openArgs)).error?.code, 'AI_PAUSED');
  assert.deepEqual(paused.counts(), { sets: 0, opens: 0 });
  const targetPaused = setup(async (path, init) => {
    if (String(path).endsWith('/session')) return response(session(['read', 'edit']));
    const input = JSON.parse(String(init?.body));
    if (String(path).endsWith('/commands')) return response(result({ ...project, id: 'fork-a' }));
    return response(input.projectId === 'fork-a' ? failed('AI_PAUSED') : result(input));
  });
  assert.equal((await targetPaused.find('view.open').execute(openArgs)).error?.code, 'AI_PAUSED');
  assert.equal(targetPaused.counts().opens, 0);
  const requests = targetPaused.calls.filter(call => call.path.endsWith('/view-access')).map(call => JSON.parse(String(call.init?.body)));
  assert.deepEqual(requests, [{ projectId: project.id, mode: 'edit' }, { projectId: 'fork-a', mode: 'edit' }]);
});

function artifactChunk() {
  const content = Buffer.from('A verified effect preview.'), hash = createHash('sha256').update(content).digest('hex');
  const artifact = { id: 'artifact-a', artifactId: 'artifact-a', projectId: project.id, jobId: 'job-a', name: 'preview.png', fileName: 'preview.png',
    mime: 'image/png', size: content.length, sha256: hash, hash: { algorithm: 'sha256', value: hash }, downloadUrl: '/api/artifacts/artifact-a' };
  return { artifact, offset: 0, length: content.length, nextOffset: null, base64: content.toString('base64'), chunkSha256: hash };
}
test('artifact chunks enforce bounds, hashes and scoped access without credential URLs', async () => {
  const chunk = artifactChunk();
  await verifyArtifactChunk(chunk, 'artifact-a', 0, 65536);
  await assert.rejects(verifyArtifactChunk({ ...chunk, chunkSha256: 'f'.repeat(64) }, 'artifact-a', 0, 65536), /SHA-256/);
  await assert.rejects(verifyArtifactChunk({ ...chunk, nextOffset: 999 }, 'artifact-a', 0, 65536), /inconsistent/);
  const f = setup(async () => response(result(chunk)));
  const read = await f.find('artifacts.read').execute({ viewSessionId: 'view-a', artifactId: 'artifact-a' });
  assert.deepEqual(read.data, chunk);
  assert.equal(f.calls[0].path, '/api/webmcp/artifacts/artifact-a?offset=0&length=65536');
  assert.equal(f.calls[0].path.includes(grant.token), false);
  assert.equal((await f.find('artifacts.read').execute({ viewSessionId: 'view-a', artifactId: 'artifact-a', length: 262145 })).error?.code, 'INVALID_INPUT');
  assert.equal(f.calls.length, 1);
});

test('native registration supports both API generations and cleans rapid remounts without duplicates', async () => {
  assert.equal(detectWebMCP({}, {}), null);
  const registered = new Map<string, WebMCPTool>();
  const native: ModelContextRegistrationAPI = { registerTool: async (tool, options) => {
    if (registered.has(tool.name)) throw new Error('duplicate');
    registered.set(tool.name, tool);
    options?.signal.addEventListener('abort', () => registered.delete(tool.name), { once: true });
    await Promise.resolve();
  } };
  const f = setup();
  const first = setupStudioWebMCP({ ...f.options, document: { modelContext: native }, navigator: {} });
  const second = setupStudioWebMCP({ ...f.options, document: { modelContext: native }, navigator: {} });
  await Promise.all([first.ready, second.ready]);
  assert.equal(second.refreshStatus().api, 'document.modelContext');
  assert.equal(registered.size, toolsForProfile(f.tools,'authoring').length);
  const staleCallback = registered.get('studio.connection.inspect')!;
  second(); second();
  assert.equal(registered.size, 0);
  assert.equal((await staleCallback.execute({})).error?.code, 'WEBMCP_DISPOSED');
  const historical: ModelContextRegistrationAPI = { registerTool: tool => { assert.equal(registered.has(tool.name), false); registered.set(tool.name, tool); }, unregisterTool: name => { registered.delete(name); } };
  const old = setupStudioWebMCP({ ...f.options, document: {}, navigator: { modelContext: historical } });
  await old.ready;
  assert.equal(old.refreshStatus().api, 'navigator.modelContext');
  assert.equal(registered.size, toolsForProfile(f.tools,'authoring').length);
  old(); assert.equal(registered.size, 0);
});

test('registration failures stay visible and never unregister another component’s duplicate tool', async () => {
  const removed: string[] = [];
  const failedNative: ModelContextRegistrationAPI = { registerTool: async () => { throw new Error('Tools permissions policy denied registration.'); }, unregisterTool: name => { removed.push(name); } };
  const f = setup(), cleanup = setupStudioWebMCP({ ...f.options, document: { modelContext: failedNative }, navigator: {} });
  await cleanup.ready;
  assert.match(cleanup.refreshStatus().error!, /permissions policy/);
  assert.equal(cleanup.refreshStatus().toolCount, 0);
  assert.deepEqual(removed, []);
  cleanup();
});


test('omitted view session uses only the current tab grant; explicit stale sessions still fail',async()=>{
  const f=setup();const view=await f.find('view.inspect').execute({});assert.equal(view.status,'ok');assert.equal((view.data as any).viewSessionId,'view-a');
  assert.equal((await f.find('view.inspect').execute({viewSessionId:'view-other'})).error?.code,'VIEW_SESSION_MISMATCH');
  f.grant(null);assert.equal((await f.find('view.inspect').execute({})).error?.code,'WEBMCP_NOT_CONNECTED');
});
