import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Command, Result } from '../packages/core/src/model.js';
import { createApp } from '../apps/service/src/app.js';

const entry = fileURLToPath(new URL('../apps/cli/src/main.ts', import.meta.url));
const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
function ok(data: unknown): Result { return { contractVersion: '0.1.0', requestId: 'test-request', status: 'ok', data, diagnostics: [] }; }
function send(response: ServerResponse, data: unknown, code = 200): void {
  response.writeHead(code, { 'content-type': 'application/json' }); response.end(JSON.stringify(data));
}
async function fixture(t: TestContext, handler?: (command: Command) => Result) {
  const directory = await mkdtemp(join(tmpdir(), 'nwn vfx żółć cli-'));
  const commands: Command[] = [];
  const authorizations: Array<string | undefined> = [];
  let requests = 0;
  let bytes: Buffer = Buffer.from('verified artifact bytes');
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    requests++;
    if (request.url === '/api/health') return send(response, { instanceId: 'installation-a', workspaceId: 'workspace-a' });
    authorizations.push(request.headers.authorization);
    if (request.url === '/api/artifacts/asset-a') { response.writeHead(200, { 'content-type': 'application/octet-stream' }); response.end(bytes); return; }
    if (request.url !== '/api/commands') return send(response, {}, 404);
    let source = ''; for await (const chunk of request) source += String(chunk);
    const command: Command = JSON.parse(source); commands.push(command);
    send(response, handler ? handler(command) : ok({ operation: command.operation, ...command.input }));
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); assert(address && typeof address !== 'string');
  const configPath = join(directory, 'connection.json');
  await writeFile(configPath, JSON.stringify({ endpoint: `http://127.0.0.1:${address.port}`, workspaceId: 'workspace-a', instanceId: 'installation-a', ownerToken: 'owner-test-secret' }));
  t.after(async () => {
    await new Promise<void>(done => server.close(() => done()));
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    assert(basename(directory).startsWith('nwn vfx żółć cli-'));
    await rm(directory, { recursive: true, force: true });
  });
  async function run(args: string[], input?: string, overrides: NodeJS.ProcessEnv = {}) {
    const env: NodeJS.ProcessEnv = { ...process.env, NWN_VFX_CONFIG: configPath, NWN_VFX_DATA_DIR: directory };
    for (const key of ['NWN_VFX_TOKEN', 'NWN_VFX_ENDPOINT', 'NWN_VFX_WORKSPACE']) delete env[key];
    Object.assign(env, overrides);
    const child = spawn(process.execPath, ['--import', loader, entry, '--json', ...args], { cwd: directory, env, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += String(chunk)); child.stderr.on('data', chunk => stderr += String(chunk));
    child.stdin.end(input);
    const code = await new Promise<number | null>((done, reject) => { child.once('error', reject); child.once('close', done); });
    const lines = stdout.trim().split('\n'); assert.equal(lines.length, 1, `Expected one JSON object, got: ${stdout}\n${stderr}`);
    return { code, stdout, stderr, value: JSON.parse(lines[0]) as Result };
  }
  return { directory, commands, authorizations, run, get requests() { return requests; }, setBytes: (value: Buffer) => { bytes = value; } };
}

test('CLI działa z obcego cwd, nie ujawnia poświadczeń i przekazuje wybrany workspace', async t => {
  const f = await fixture(t);
  const version = await f.run(['version']);
  assert.equal(version.code, 0); assert.equal(f.requests, 0);
  const response = await f.run(['projects', 'inspect', '--project', 'effect-a', '--revision', '12', '--workspace', 'workspace-a'], undefined, { NWN_VFX_TOKEN: 'scoped-agent-token' });
  assert.equal(response.code, 0);
  assert.deepEqual(f.commands[0], { operation: 'projects.inspect', input: { projectId: 'effect-a', revision: 12 }, contractVersion: '0.1.0', workspaceId: 'workspace-a' });
  assert.deepEqual(f.authorizations, ['Bearer scoped-agent-token']);
  assert(!response.stdout.includes('scoped-agent-token')); assert(!response.stdout.includes('owner-test-secret'));
  assert.deepEqual((await readdir(f.directory)).sort(), ['connection.json']);
});

test('preview CLI reads an explicit camera JSON from a foreign cwd and rejects invalid cameras before network', async t => {
  const f = await fixture(t), path = join(f.directory,'kadr wysoki.json');
  const camera = {position:[7,-11,6],target:[0,0,2.6],fov:45};
  await writeFile(path,JSON.stringify(camera));
  const args=['preview','request','--project','effect-a','--revision','7','--format','webm','--camera-file',path,'--idempotency-key','camera-cli-key'];
  assert.equal((await f.run(args)).code,0);
  assert.deepEqual(f.commands[0].input,{projectId:'effect-a',revision:7,format:'webm',camera});
  assert(!JSON.stringify(f.commands[0]).includes(f.directory));
  const requests=f.requests;
  for(const value of ['bad JSON',JSON.stringify({...camera,position:camera.target}),JSON.stringify({...camera,fov:180}),' '.repeat(4097)]) {
    await writeFile(path,value); assert.notEqual((await f.run(args)).code,0); assert.equal(f.requests,requests);
  }
});

test('native status CLI forwards only the explicit candidate ID from a foreign cwd', async t => {
  const f = await fixture(t);
  const result = await f.run(['native', 'test', 'status', '--candidate', 'build-job-a']);
  assert.equal(result.code, 0, result.stdout);
  assert.deepEqual(f.commands[0], { operation: 'native.test.status', input: { candidateId: 'build-job-a' }, contractVersion: '0.1.0', workspaceId: 'workspace-a' });
  const count = f.requests;
  assert.notEqual((await f.run(['native', 'test', 'status'])).code, 0);
  assert.equal(f.requests, count);
});

test('assets CLI reads an explicit local PNG in a foreign cwd and sends bytes without client paths', async t => {
  const f = await fixture(t);
  const { orientationTexture } = await import('./fixtures/rgba-texture.js');
  const bytes = Buffer.from(orientationTexture(8)), path = join(f.directory, 'własna tekstura.png');
  await writeFile(path, bytes);
  const imported = await f.run(['assets','import','--project','effect-a','--expected-revision','7','--file',path,'--idempotency-key','asset-cli-import-key']);
  assert.equal(imported.code, 0, imported.stdout);
  assert.deepEqual(f.commands[0].input, {projectId:'effect-a',expectedRevision:7,fileName:'własna tekstura.png',pngBase64:bytes.toString('base64')});
  assert.equal(f.commands[0].operation, 'assets.import');
  assert.equal(JSON.stringify(f.commands[0]).includes(f.directory), false);
  const listed = await f.run(['assets','list','--project','effect-a','--revision','8']);
  assert.equal(listed.code,0);assert.equal(f.commands[1].operation,'assets.list');
  assert.equal((await f.run(['assets','get',createHash('sha256').update(bytes).digest('hex'),'--project','effect-a','--revision','8'])).code,0);
  assert.equal(f.commands[2].operation,'assets.get');
  for (const targetSize of [512, 1024]) {
    const normalized = await f.run(['assets','import','--project','effect-a','--expected-revision','8','--file',path,
      '--target-size',String(targetSize),'--idempotency-key',`asset-cli-normalize-${targetSize}`]);
    assert.equal(normalized.code, 0, normalized.stdout);
    assert.deepEqual(f.commands.at(-1)?.input, { projectId:'effect-a', expectedRevision:8, fileName:'własna tekstura.png',
      pngBase64:bytes.toString('base64'), targetSize });
  }
});

test('OBJ CLI uses explicit axes/units, sends exact UTF-8 source and preserves target, transform and retry key', async t => {
  const f = await fixture(t, () => ok({ accepted: true }));
  const source = '# asymetryczna bryła\nv 0 0 0\nv 2 0 0\nv 0 1 1\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n';
  const file = join(f.directory, 'kamień.obj'), transformFile = join(f.directory, 'świadoma transformacja.json');
  const transform = { translation: [0, 0, .5], orientation: [0, 0, 1, .25], scale: 1.2 };
  await writeFile(file, source); await writeFile(transformFile, JSON.stringify(transform));
  const base = ['meshes', 'import-obj', '--project', 'effect-a', '--expected-revision', '7', '--file', file,
    '--source-up', 'y', '--meters-per-unit', '0.01', '--normals', 'flat', '--layer', 'stone', '--texture-asset', 'a'.repeat(64), '--transform-file', transformFile];
  const input = { projectId: 'effect-a', expectedRevision: 7, fileName: 'kamień.obj', objText: source, sourceUpAxis: 'y', metersPerUnit: .01,
    normalMode: 'flat', target: { layerId: 'stone' }, textureAssetId: 'a'.repeat(64), transform };
  assert.equal((await f.run([...base, '--preview'])).code, 0);
  assert.equal(f.commands[0].operation, 'meshes.importObj.preview'); assert.deepEqual(f.commands[0].input, input);
  const apply = [...base, '--idempotency-key', 'obj-cli-stable-key'];
  assert.equal((await f.run(apply)).code, 0); assert.equal((await f.run(apply)).code, 0);
  assert.deepEqual(f.commands[1], f.commands[2]); assert.equal(f.commands[1].operation, 'meshes.importObj');
  assert.deepEqual(f.commands[1].input, input); assert.equal(f.commands[1].idempotencyKey, 'obj-cli-stable-key');
  assert.equal(JSON.stringify(f.commands).includes(f.directory), false, 'Only the basename and source text cross the API');
  const { makeMeshLayer } = await import('../packages/core/src/model.js');
  const { geometry: _geometry, ...newLayer } = makeMeshLayer('new-stone', 'Explicit new stone');
  const newFile = join(f.directory, 'nowa warstwa.json'); await writeFile(newFile, JSON.stringify(newLayer));
  const fresh = ['meshes', 'import-obj', '--project', 'effect-a', '--expected-revision', '7', '--file', file,
    '--source-up', 'z', '--meters-per-unit', '1', '--normals', 'flat', '--new-layer-file', newFile, '--preview'];
  assert.equal((await f.run(fresh)).code, 0); assert.deepEqual(f.commands.at(-1)!.input.target, { newLayer });
});

test('OBJ CLI rejects missing choices, ambiguous target, invalid UTF-8 and oversize source before networking', async t => {
  const f = await fixture(t), file = join(f.directory, 'source.obj');
  await writeFile(file, 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  const base = ['meshes', 'import-obj', '--project', 'effect-a', '--expected-revision', '1', '--file', file, '--preview'];
  for (const flags of [[], ['--source-up', 'x', '--meters-per-unit', '1', '--normals', 'flat', '--layer', 'mesh'],
    ['--source-up', 'z', '--meters-per-unit', '0', '--normals', 'flat', '--layer', 'mesh'],
    ['--source-up', 'z', '--meters-per-unit', '1', '--normals', 'smooth', '--layer', 'mesh'],
    ['--source-up', 'z', '--meters-per-unit', '1', '--normals', 'flat'],
    ['--source-up', 'z', '--meters-per-unit', '1', '--normals', 'flat', '--layer', 'mesh', '--new-layer-file', 'unread.json']]) {
    assert.notEqual((await f.run([...base, ...flags])).code, 0);
  }
  const valid = [...base, '--source-up', 'z', '--meters-per-unit', '1', '--normals', 'flat', '--layer', 'mesh'];
  assert.notEqual((await f.run(valid.filter(item => item !== '--preview'))).code, 0, 'Writes need an idempotency key');
  await writeFile(file, Buffer.from([0xc3, 0x28]));
  assert.equal((await f.run(valid)).value.error?.code, 'INVALID_ARGUMENT');
  await writeFile(file, Buffer.alloc(1024 * 1024 + 1, 32));
  assert.equal((await f.run(valid)).value.error?.code, 'LIMIT_EXCEEDED'); assert.equal(f.requests, 0);
});

test('assets remove CLI forwards only the explicit unused IDs and stable mutation identity', async t => {
  const f = await fixture(t);
  const args = ['assets', 'remove', '--project', 'effect-a', '--expected-revision', '8', '--asset-ids', `${'a'.repeat(64)},${'b'.repeat(64)}`, '--idempotency-key', 'remove-unused-assets'];
  assert.equal((await f.run(args)).code, 0);
  assert.deepEqual(f.commands[0].input, { projectId: 'effect-a', expectedRevision: 8, assetIds: ['a'.repeat(64), 'b'.repeat(64)] });
  assert.equal(f.commands[0].operation, 'assets.remove'); assert.equal(f.commands[0].idempotencyKey, 'remove-unused-assets');
});

test('nieprawidłowe flagi, argumenty i brak idempotencji zawodzą przed siecią jako JSON', async t => {
  const f = await fixture(t);
  for (const args of [
    ['projects', 'create', '--name', 'Test'],
    ['projects', 'create', '--name', 'Test', '--idempotency-key', 'create-key', '--unknown', 'x'],
    ['projects', 'inspect', '--project', 'effect-a', '--revision', 'nan'],
    ['candidate', 'build', '--project', 'effect-a', '--revision', '1', '--idempotency-key', 'short'],
    ['projects', 'create', '--preset', 'imaginary', '--idempotency-key', 'create-key'],
    ['assets', 'import', '--project', 'effect-a', '--expected-revision', '1', '--file', 'not-read.png', '--target-size', '256', '--idempotency-key', 'invalid-target-key'],
    ['assets', 'import', '--project', 'effect-a', '--expected-revision', '1', '--file', 'not-read.png', '--target-size', '512.5', '--idempotency-key', 'invalid-target-key'],
  ]) {
    const response = await f.run(args);
    assert.equal(response.code, 2, response.stdout); assert.equal(response.value.status, 'failed');
  }
  assert.equal(f.requests, 0);
});

test('assets CLI permits larger input only with explicit normalization and rejects above 8 MiB before networking', async t => {
  // This transport fixture intentionally does not decode PNG: the service owns
  // format validation. Its small reply keeps binary payloads out of stdout.
  const f = await fixture(t, () => ok({ accepted: true }));
  const path = join(f.directory, 'large-source.png'), bytes = Buffer.alloc(2 * 1024 * 1024 + 1, 0x61);
  await writeFile(path, bytes);
  const args = ['assets', 'import', '--project', 'effect-a', '--expected-revision', '1', '--file', path, '--idempotency-key', 'byte-limit-import'];
  const strict = await f.run(args);
  assert.equal(strict.value.error?.code, 'LIMIT_EXCEEDED'); assert.equal(f.requests, 0);
  const normalized = await f.run([...args, '--target-size', '512']);
  assert.equal(normalized.code, 0, normalized.stdout); assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0].input.targetSize, 512);
  assert.equal(createHash('sha256').update(Buffer.from(String(f.commands[0].input.pngBase64), 'base64')).digest('hex'), createHash('sha256').update(bytes).digest('hex'));
  const requestCount = f.requests;
  const oversized = await open(path, 'w');
  try { await oversized.truncate(8 * 1024 * 1024 + 1); } finally { await oversized.close(); }
  const tooLarge = await f.run([...args, '--target-size', '1024']);
  assert.equal(tooLarge.value.error?.code, 'LIMIT_EXCEEDED'); assert.equal(f.requests, requestCount);
  assert.match(tooLarge.value.error!.message, /8 MiB/);
});

test('stdin JSON i ponowienie zachowują dokładne dane komendy i klucz', async t => {
  const f = await fixture(t);
  const args = ['--no-input', 'changes', 'apply', '--project', 'effect-a', '--expected-revision', '12', '--input', '-', '--idempotency-key', 'durable-change-key'];
  const changes = [{ type: 'layer.set', layerId: 'sparks', values: { speed: 2 } }];
  assert.equal((await f.run(args, JSON.stringify(changes))).code, 0);
  assert.equal((await f.run(args, JSON.stringify({ changes }))).code, 0);
  assert.equal(f.commands.length, 2); assert.deepEqual(f.commands[0], f.commands[1]);
  assert.equal(f.commands[0].idempotencyKey, 'durable-change-key');
  assert.deepEqual(f.commands[0].input, { projectId: 'effect-a', expectedRevision: 12, changes });
});

test('niezgodny workspace jest odrzucany przed wysłaniem Bearer lub mutacji', async t => {
  const f = await fixture(t);
  const response = await f.run(['projects', 'list', '--workspace', 'workspace-other']);
  assert.equal(response.code, 3); assert.equal(response.value.error?.code, 'WORKSPACE_MISMATCH');
  assert.equal(f.commands.length, 0); assert.equal(f.authorizations.length, 0);
});

test('operations call nie pozwala podszyć się pod aktora przez wejście', async t => {
  const f = await fixture(t);
  const response = await f.run(['operations', 'call', 'projects.create', '--input', '-', '--idempotency-key', 'create-key'], JSON.stringify({ name: 'Example', actorId: 'owner' }));
  assert.equal(response.code, 2); assert.equal(response.value.error?.code, 'VALIDATION_ERROR'); assert.equal(f.requests, 0);
});

test('jobs get odróżnia odczyt failed od jobs wait zakończonego błędem', async t => {
  const f = await fixture(t, () => ok({ id: 'job-a', status: 'failed', error: { code: 'RENDER_FAILED', message: 'Renderer unavailable' } }));
  const get = await f.run(['jobs', 'get', 'job-a']); assert.equal(get.code, 0);
  const wait = await f.run(['jobs', 'wait', 'job-a', '--timeout', '5s']); assert.equal(wait.code, 5);
  assert.equal(wait.value.error?.code, 'JOB_FAILED'); assert.equal((wait.value.data as { status: string }).status, 'failed');
});

test('timeout jobs wait nie wysyła cancel i zachowuje identyfikator pracy', async t => {
  const f = await fixture(t, () => ok({ id: 'job-a', status: 'cancelling' }));
  const response = await f.run(['jobs', 'wait', 'job-a', '--timeout', '250ms']);
  assert.equal(response.code, 6); assert.equal(response.value.error?.code, 'WAIT_TIMEOUT');
  assert.equal((response.value.error?.details as { jobId: string }).jobId, 'job-a');
  assert(f.commands.length >= 1); assert(f.commands.every(command => command.operation === 'jobs.get'));
  assert.match(response.stderr, /cancelling/);
});

test('pobranie sprawdza SHA-256, odmawia nadpisania i nie publikuje uszkodzonych bajtów', async t => {
  const content = Buffer.from('verified artifact bytes');
  const metadata = { id: 'asset-a', artifactId: 'asset-a', name: 'output.bin', size: content.length, sha256: createHash('sha256').update(content).digest('hex') };
  const f = await fixture(t, () => ok(metadata));
  const target = join(f.directory, 'wynik.bin');
  const first = await f.run(['artifacts', 'get', 'asset-a', '--out', target]);
  assert.equal(first.code, 0); assert.deepEqual(await readFile(target), content);
  assert.equal((first.value.data as { verifiedSha256: string }).verifiedSha256, metadata.sha256);
  const second = await f.run(['artifacts', 'get', 'asset-a', '--out', target]);
  assert.equal(second.code, 2); assert.equal(second.value.error?.code, 'OUTPUT_EXISTS');
  f.setBytes(Buffer.from('corrupted artifact data'));
  const corrupt = await f.run(['artifacts', 'get', 'asset-a', '--out', target, '--overwrite']);
  assert.equal(corrupt.code, 5); assert.equal(corrupt.value.error?.code, 'ARTIFACT_INTEGRITY');
  assert.deepEqual(await readFile(target), content);
  assert(!(await readdir(f.directory)).some(name => name.endsWith('.part')));
});

test('rzeczywista usługa: zewnętrzny CLI edytuje, odzyskuje retry i przekazuje artefakt uprawnionemu aktorowi', async t => {
  const f = await fixture(t);
  const portProbe = createServer();
  await new Promise<void>(done => portProbe.listen(0, '127.0.0.1', done));
  const address = portProbe.address(); assert(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>(done => portProbe.close(() => done()));
  const app = await createApp({ dataDir: join(f.directory, 'real-service'), port });
  try {
    await app.listen({ host: '127.0.0.1', port });
    await writeFile(join(f.directory, 'connection.json'), JSON.stringify(app.studio.config));
    const created = await f.run(['projects', 'create', '--project', 'cli-real-effect', '--preset', 'coil', '--idempotency-key', 'real-create-key']);
    assert.equal(created.code, 0, created.value.error?.message ?? 'create should succeed');
    const editArgs = ['changes', 'apply', '--project', 'cli-real-effect', '--expected-revision', '1', '--input', '-', '--idempotency-key', 'real-edit-key'];
    const patch = JSON.stringify([{ type: 'layer.set', layerId: 'sparks', values: { speed: 2.8 } }]);
    const edited = await f.run(editArgs, patch);
    assert.equal(edited.code, 0, edited.value.error?.message ?? 'edit should succeed');
    const retry = await f.run(editArgs, patch);
    assert.equal(retry.code, 0); assert.equal(retry.value.operationId, edited.value.operationId);
    const conflict = await f.run(['layers', 'enable', '--project', 'cli-real-effect', '--expected-revision', '1', '--layer', 'sparks', '--enabled', 'false', '--idempotency-key', 'real-conflict-key']);
    assert.equal(conflict.code, 4); assert.equal(conflict.value.error?.code, 'REVISION_CONFLICT');
    const exported = await f.run(['projects', 'export', '--project', 'cli-real-effect', '--revision', '2', '--idempotency-key', 'real-export-key']);
    assert.equal(exported.code, 0, exported.value.error?.message ?? 'export should succeed');
    const artifact = (exported.value.data as { artifact: { id: string } }).artifact;
    assert(artifact?.id);
    const actor = await f.run(['actors', 'create', '--name', 'Reader from another project', '--projects', 'cli-real-effect', '--scopes', 'jobs,artifacts', '--idempotency-key', 'real-actor-key']);
    assert.equal(actor.code, 0, actor.value.error?.message ?? 'actor creation should succeed');
    const token = (actor.value.data as { token: string }).token; assert.equal(typeof token, 'string');
    const download = await f.run(['artifacts', 'get', artifact.id, '--out', join(f.directory, 'handoff-result.bin')], undefined, { NWN_VFX_TOKEN: token });
    assert.equal(download.code, 0, download.value.error?.message ?? 'download should succeed');
    assert.equal((download.value.data as { verifiedSha256: string }).verifiedSha256.length, 64);
    const imported = await f.run(['projects', 'import', '--file', join(f.directory, 'handoff-result.bin'), '--project', 'cli-imported-effect', '--idempotency-key', 'real-import-key']);
    assert.equal(imported.code, 0, imported.value.error?.message ?? 'ZIP import should succeed');
    assert.equal((imported.value.data as { document: { layers: Array<{ speed: number }> } }).document.layers[0].speed, 2.8);
    const forbidden = await f.run(['layers', 'enable', '--project', 'cli-real-effect', '--expected-revision', '2', '--layer', 'sparks', '--enabled', 'false', '--idempotency-key', 'reader-no-edit-key'], undefined, { NWN_VFX_TOKEN: token });
    assert.equal(forbidden.code, 3); assert.equal(forbidden.value.error?.code, 'FORBIDDEN');
    const deniedStop = await f.run(['service', 'stop', '--idempotency-key', 'reader-no-stop-key'], undefined, { NWN_VFX_TOKEN: token });
    assert.equal(deniedStop.code, 3); assert.equal(deniedStop.value.error?.code, 'FORBIDDEN');
    const stopped = await f.run(['service', 'stop', '--idempotency-key', 'owner-stop-key']);
    assert.equal(stopped.code, 0); assert.equal((stopped.value.data as { stopping: boolean }).stopping, true);
  } finally { await app.close(); }
});
