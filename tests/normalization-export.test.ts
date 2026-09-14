import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { unzipSync, strFromU8, strToU8, zipSync } from 'fflate';
import { createApp } from '../apps/service/src/app.js';
import { canonical } from '../apps/service/src/store.js';
import { makeDocument, makeLayer, makeMeshLayer, type EffectDocument, type MeshLayer } from '../packages/core/src/model.js';
import { createTextureAsset, decodePngRgba8 } from '../packages/core/src/textures.js';
import { buildCandidate, readAsciiMdl, readHak, readTga, readTxi, textProperty } from '../packages/nwn-format/src/index.js';
import { rgbaPng } from './fixtures/rgba-texture.js';

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const pixel = (rgba: Uint8Array, width: number, x: number, y: number) => [...rgba.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
const ok = (result: any) => { assert.notEqual(result.status, 'failed', JSON.stringify(result.error)); return result.data; };

/** An independently encoded non-POT 2:1 image: asymmetric quadrants and a
 * continuous soft-alpha border. Production normalization does not author it. */
function sourceFixture() {
  return rgbaPng(768, 384, (x, y) => {
    const color = y < 192 ? (x < 384 ? [240, 20, 10] : [20, 220, 30]) : (x < 384 ? [10, 30, 230] : [240, 210, 20]);
    const alpha = Math.round(255 * Math.min(1, Math.min(x, y, 767 - x, 383 - y) / 32));
    return [...color, alpha] as [number, number, number, number];
  });
}
function texturedDocument(asset: ReturnType<typeof createTextureAsset>): EffectDocument {
  const mesh: MeshLayer = { ...makeMeshLayer('surface', 'UV orientation', 'custom'), texture: `asset:${asset.id}`, blend: 'normal',
    geometry: { kind: 'custom', vertices: [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]], faces: [[0, 1, 2], [0, 2, 3]],
      uv: [[0, 0], [1, 0], [1, 1], [0, 1]], uvFaces: [[0, 1, 2], [0, 2, 3]] } };
  return { ...makeDocument('empty'), schemaVersion: 3, assets: [asset], layers: [mesh,
    { ...makeLayer('particles'), texture: `asset:${asset.id}`, blend: 'normal', midColor: '#11aadd', midAlpha: .75, midSize: .4, midPercent: .3 }] };
}

test('normalization preserves aspect/orientation/soft alpha, then NWN resources preserve exact normalized pixels and provenance', () => {
  const original = sourceFixture(), asset = createTextureAsset('wide-source.png', base64(original), 512);
  const normalizedBytes = Buffer.from(asset.pngBase64, 'base64'), image = decodePngRgba8(normalizedBytes);
  assert.equal(asset.id, sha(normalizedBytes)); assert.equal(asset.source.sha256, asset.id); assert.notEqual(asset.id, sha(original));
  assert.deepEqual(asset.source.normalization, { version: 1, method: 'area', colorSpace: 'linear-srgb', alphaMode: 'premultiplied',
    originalSha256: sha(original), originalWidth: 768, originalHeight: 384, originalColorType: 6, targetSize: 512,
    contentWidth: 512, contentHeight: 256, offsetX: 0, offsetY: 128 });
  assert.equal(image.width, 512); assert.equal(image.height, 512);
  assert.deepEqual(pixel(image.rgba, 512, 128, 192), [240, 20, 10, 255]);
  assert.deepEqual(pixel(image.rgba, 512, 384, 192), [20, 220, 30, 255]);
  assert.deepEqual(pixel(image.rgba, 512, 128, 320), [10, 30, 230, 255]);
  assert.deepEqual(pixel(image.rgba, 512, 384, 320), [240, 210, 20, 255]);
  assert.ok(image.rgba.slice(0, 128 * 512 * 4).every(value => value === 0));
  assert.ok(image.rgba.slice(384 * 512 * 4).every(value => value === 0));
  const soft = pixel(image.rgba, 512, 8, 256)[3]; assert.ok(soft > 0 && soft < 255);
  assert.deepEqual(createTextureAsset('wide-source.png', base64(original), 512), asset);

  const document = texturedDocument(asset), built = buildCandidate(document, 'normalized_rgba');
  const hak = readHak(built.files.find(file => file.name.endsWith('.hak'))!.data), mdlBytes = hak.find(file => file.name.endsWith('.mdl'))!.data;
  assert.equal(hak.length, 3);
  for (const resource of hak) assert.deepEqual(resource.data, built.files.find(file => file.name === resource.name)!.data);
  const mdl = readAsciiMdl(mdlBytes), mesh = mdl.nodes.find(node => node.type === 'trimesh')!, emitter = mdl.nodes.find(node => node.type === 'emitter')!;
  const ref = textProperty(mesh, 'bitmap'); assert.equal(textProperty(emitter, 'texture'), ref);
  assert.deepEqual(mesh.tables.tverts, [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]);
  assert.deepEqual(mesh.tables.faces, [[0, 1, 2, 0, 0, 1, 2, 0], [0, 2, 3, 0, 0, 2, 3, 0]]);
  const tga = readTga(hak.find(file => file.name === `${ref}.tga`)!.data);
  assert.deepEqual(tga.rgba, image.rgba); assert.equal(tga.origin, 'bottom-left');
  assert.deepEqual(readTxi(hak.find(file => file.name === `${ref}.txi`)!.data), { blending: 'default', filter: 1, mipmap: 1 });
  assert.equal(built.validation.readback.textures[0].rgbaSha256, sha(image.rgba));
  assert.deepEqual(built.validation.assets[0].source, asset.source); assert.equal(built.validation.nativeVerified, false);
  assert.deepEqual(JSON.parse(strFromU8(built.files.find(file => file.name === 'effect-document.json')!.data)), document);
});

test('resampling uses linear light and premultiplied alpha in analytic area and bilinear cases', () => {
  for (const upsample of [false, true]) {
    const width = upsample ? 4 : 1024, height = upsample ? 2 : 768;
    const normalize = (fn: (x: number, y: number) => [number, number, number, number]) => {
      const asset = createTextureAsset('analytic.png', base64(rgbaPng(width, height, fn)), 512);
      assert.equal(asset.source.normalization!.method, upsample ? 'bilinear' : 'area');
      return decodePngRgba8(Buffer.from(asset.pngBase64, 'base64'));
    };
    // Equal black/white energy produces sRGB about188, not128. The upsample
    // coordinate lies within 1/256 of equal weights at the first transition.
    const light = normalize(x => x % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]);
    const center = pixel(light.rgba, 512, upsample ? 127 : 128, 256);
    assert.ok(center[0] >= 187 && center[0] <= 188, JSON.stringify({ upsample, center }));
    assert.deepEqual(center.slice(0, 3), [center[0], center[0], center[0]]); assert.equal(center[3], 255);
    // Invisible saturated blue must not contaminate a visible red edge.
    const alpha = normalize(x => x % 2 ? [0, 0, 255, 0] : [255, 0, 0, 255]);
    const edge = pixel(alpha.rgba, 512, upsample ? 127 : 128, 256);
    assert.deepEqual(edge.slice(0, 3), [255, 0, 0]); assert.ok(edge[3] >= 127 && edge[3] <= 129);
  }
});

test('service import, revision reload, portable ZIP and candidate job retain normalized bytes and provenance', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nwn-vfx-normalized-export-')); let app = await createApp({ dataDir: directory });
  const call = async (operation: string, input: object) => (await app.inject({ method: 'POST', url: '/api/commands',
    headers: { host: '127.0.0.1:4317', authorization: `Bearer ${app.studio.config.ownerToken}` },
    payload: { operation, input, idempotencyKey: randomUUID() } })).json();
  const download = async (url: string) => {
    const response = await app.inject({ url, headers: { host: '127.0.0.1:4317', authorization: `Bearer ${app.studio.config.ownerToken}` } });
    assert.equal(response.statusCode, 200); return response.rawPayload;
  };
  try {
    const original = sourceFixture(); let project = ok(await call('projects.create', { preset: 'empty', name: 'Isolated normalization proof' }));
    const rejected = await call('assets.import', { projectId: project.id, expectedRevision: project.revision, fileName: 'wide.png', pngBase64: base64(original) });
    assert.equal(rejected.status, 'failed'); assert.equal(ok(await call('projects.inspect', { projectId: project.id })).revision, 1);
    const imported = ok(await call('assets.import', { projectId: project.id, expectedRevision: project.revision,
      fileName: 'wide.png', pngBase64: base64(original), targetSize: 512 })); project = imported.project;
    const asset = project.document.assets[0], normalizedBytes = Buffer.from(asset.pngBase64, 'base64');
    assert.equal(asset.id, sha(normalizedBytes)); assert.equal(asset.source.sha256, asset.id);
    assert.equal(asset.source.normalization.originalSha256, sha(original));
    const desired = texturedDocument(asset);
    project = ok(await call('changes.apply', { projectId: project.id, expectedRevision: project.revision, changes: [
      { type: 'layer.remove', layerId: 'sparks' }, ...desired.layers.map(layer => ({ type: 'layer.add', layer }))] }));
    const beforeRestart = structuredClone(project.document);
    await app.close(); app = await createApp({ dataDir: directory });
    assert.deepEqual(ok(await call('projects.inspect', { projectId: project.id })).document, beforeRestart);
    assert.deepEqual(ok(await call('assets.get', { projectId: project.id, assetId: asset.id })), asset);

    const exported = ok(await call('projects.export', { projectId: project.id, revision: project.revision }));
    const bundle = await download(exported.artifact.downloadUrl), files = unzipSync(bundle), path = `assets/${asset.id}.png`;
    assert.deepEqual(files[path], new Uint8Array(normalizedBytes));
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    assert.deepEqual(manifest.assets[0].source, asset.source);
    assert.equal(manifest.snapshotSha256, sha(canonical(project.document)));
    const copy = ok(await call('projects.import', { bundleBase64: bundle.toString('base64') }));
    assert.notEqual(copy.id, project.id); assert.deepEqual(copy.document, project.document);
    const badManifest = structuredClone(manifest); badManifest.assets[0].source.normalization.originalSha256 = 'f'.repeat(64);
    const tampered = zipSync({ ...files, 'manifest.json': strToU8(JSON.stringify(badManifest)) });
    assert.equal((await call('projects.import', { bundleBase64: base64(tampered) })).error.code, 'BUNDLE_HASH_MISMATCH');

    const build = await call('candidate.build', { projectId: copy.id, revision: copy.revision, modelName: 'normalized_job' });
    assert.equal(build.status, 'accepted'); await app.studio.drainJobs();
    const job = ok(await call('jobs.get', { jobId: build.data.id })); assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
    const candidate = await download(job.artifacts.find((a: any) => a.name === 'candidate.zip').downloadUrl), native = unzipSync(candidate);
    const handoff = JSON.parse(strFromU8(native['handoff.json'])), validation = JSON.parse(strFromU8(native['validation.json']));
    assert.equal(handoff.revision, copy.revision); assert.equal(handoff.snapshotSha256, sha(canonical(copy.document)));
    assert.deepEqual(handoff.assets[0].source, asset.source); assert.deepEqual(validation.assets[0].source, asset.source);
    assert.deepEqual(JSON.parse(strFromU8(native['effect-document.json'])), copy.document);
    const hak = readHak(native['normalized_job.hak']);
    for (const resource of hak) assert.deepEqual(resource.data, native[resource.name]);
    assert.deepEqual(readTga(hak.find(resource => resource.name.endsWith('.tga'))!.data).rgba, decodePngRgba8(normalizedBytes).rgba);
    assert.equal(validation.nativeVerified, false);
  } finally {
    await app.close();
    const resolved = resolve(directory);
    assert.equal(resolve(resolved, '..'), resolve(tmpdir())); assert.ok(basename(resolved).startsWith('nwn-vfx-normalized-export-'));
    rmSync(resolved, { recursive: true, force: true });
  }
});
