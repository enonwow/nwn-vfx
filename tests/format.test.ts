import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import { makeDocument as makeEffectDocument, makeLayer, makeMeshLayer, DomainError, type EffectDocument, type EmitterLayer, type MeshLayer } from '../packages/core/src/model.js';
import { buildMeshGeometry } from '../packages/core/src/mesh.js';
import { createTextureAsset, resolveTexture } from '../packages/core/src/textures.js';
import { validateOperationOutput } from '../packages/contracts/src/schema.js';
import { buildCandidate, numeric, readAsciiMdl, readHak, readTga, readTxi, sampleTrack, textProperty, vector, writeHak, zipCandidate } from '../packages/nwn-format/src/index.js';

const fixture = readFileSync(new URL('./fixtures/independent-emitter.mdl', import.meta.url), 'utf8');
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const expectCode = (code: string) => (error: unknown) => error instanceof DomainError && error.code === code;
// The existing emitter preset fixtures intentionally exercise v1 documents.
const makeDocument = (...args: Parameters<typeof makeEffectDocument>) => makeEffectDocument(...args) as EffectDocument & { layers: EmitterLayer[] };
const meshDocument = (layers: MeshLayer[], duration = 3): EffectDocument => ({ ...makeEffectDocument('empty'), schemaVersion: 2, duration, layers });

test('independent ASCII fixture: Z-up parent, signed mass, keys with/without count', () => {
  const parsed = readAsciiMdl(fixture);
  assert.equal(parsed.model, 'fixture_vfx');
  const emitter = parsed.nodes.find(node => node.name === 'sparks')!;
  const parent = parsed.nodes.find(node => node.name === 'offset_parent')!;
  assert.deepEqual(vector(parent, 'position'), [1.25, -2, .7]);
  assert.equal(numeric(parent, 'scale'), .5);
  assert.equal(numeric(emitter, 'mass'), -.2);
  assert.equal(numeric(emitter, 'birthrate'), 7);
  assert.equal(numeric(emitter, 'percentMid'), .375);
  assert.equal(numeric(emitter, 'alphaMid'), .95);
  assert.equal(numeric(emitter, 'sizeMid'), .1875);
  assert.deepEqual(vector(emitter, 'colorMid'), [.125, .75, .375]);
  assert.equal(textProperty(emitter, 'update'), 'Explosion');
  assert.deepEqual(parsed.animations[0].events, [{ time: .125, name: 'detonate' }]);
  assert.deepEqual(sampleTrack(parsed.animations[0].nodes[1].tracks.scale, 1), [.625]);
  assert.deepEqual(sampleTrack(parsed.animations[0].nodes[2].tracks.birthrate, .125), [7]);
});

test('independently timed Explosion gates match exact event times; frame isolation remains unqualified', () => {
  const document = makeDocument('empty');
  document.layers = [{ ...makeLayer('first'), count: 5, start: 0 }, { ...makeLayer('second'), count: 17, start: .5 }];
  const built = buildCandidate(document, 'burst_pair');
  const mdl = readAsciiMdl(built.files.find(file => file.name === 'burst_pair.mdl')!.data);
  const anim = mdl.animations[0];
  assert.deepEqual(anim.events.map(event => event.time), [0, .5]);
  const emitters = anim.nodes.filter(node => node.type === 'emitter');
  assert.deepEqual(emitters.map(node => sampleTrack(node.tracks.birthrate, 0)[0]), [5, 0]);
  assert.deepEqual(emitters.map(node => sampleTrack(node.tracks.birthrate, .5)[0]), [0, 17]);
  assert.equal(built.validation.nativeVerified, false);
  assert.equal(built.validation.structuralValidation, 'passed');
  assert.equal(built.validation.checks.burstEventsIsolated,false);
  assert.ok(built.validation.diagnostics.some(d=>d.code==='EXPLOSION_FRAME_SAMPLING_UNQUALIFIED'));
});

test('Fountain serialized envelope is bounded and integrates to requested population', () => {
  const document = makeDocument('empty');
  document.layers[0] = { ...document.layers[0], update: 'Fountain', start: .25, duration: .8, life: .6, count: 43, gravity: -.2 };
  const built = buildCandidate(document, 'fountain_one');
  const parsed = readAsciiMdl(built.files.find(file => file.name.endsWith('.mdl'))!.data);
  assert.equal(parsed.animations[0].events.length, 0);
  const emitter = parsed.animations[0].nodes.find(node => node.type === 'emitter')!;
  const rows = emitter.tracks.birthrate;
  assert.equal(sampleTrack(rows, .24)[0], 0);
  assert.equal(sampleTrack(rows, 1.1)[0], 0);
  const integral = rows.slice(1).reduce((sum, row, i) => sum + (row[0] - rows[i][0]) * (row[1] + rows[i][1]) / 2, 0);
  assert.ok(Math.abs(integral - 43) < 1e-8);
  assert.equal(numeric(parsed.nodes.find(node => node.type === 'emitter')!, 'mass'), -.2);
  assert.ok(built.validation.diagnostics.some(item => item.code === 'FOUNTAIN_COUNT_APPROXIMATE'));
});

test('parent scale is represented in hierarchy without secretly rewriting sizes or axes', () => {
  const doc = makeDocument('empty');
  doc.layers[0] = { ...doc.layers[0], scale: 2.5, position: [1, -2, 3], size: .15, endSize: .04, alpha: .65, endAlpha: .1 };
  const built = buildCandidate(doc, 'scale_case');
  const parsed = readAsciiMdl(built.files.find(file => file.name.endsWith('.mdl'))!.data);
  const emitter = parsed.nodes.find(node => node.type === 'emitter')!;
  const parent = parsed.nodes.find(node => node.name === textProperty(emitter, 'parent'))!;
  assert.equal(numeric(parent, 'scale'), 2.5);
  assert.deepEqual(vector(parent, 'position'), [1, -2, 3]);
  assert.equal(numeric(emitter, 'sizeStart'), .15);
  assert.equal(numeric(emitter, 'alphaStart'), .65);
  assert.ok(built.validation.diagnostics.some(item => item.code === 'PARENT_SCALE_UNQUALIFIED'));
});

for (const preset of ['coil', 'vial']) test(`${preset}: deterministic candidate ZIP preserves document, HAK payload and all texture dependencies`, () => {
  const doc = makeDocument(preset);
  const first = buildCandidate(doc, `test_${preset}`), second = buildCandidate(doc, `test_${preset}`);
  const zip = zipCandidate(first);
  assert.deepEqual(zip, zipCandidate(second));
  const files = unzipSync(zip);
  assert.deepEqual(JSON.parse(decode(files['effect-document.json'])), doc);
  const validation = JSON.parse(decode(files['validation.json']));
  assert.equal(validation.nativeVerified, false);
  assert.equal(validation.integration.moduleIncluded, false);
  assert.equal(validation.integration.visualeffects2daIncluded, false);
  const hak = readHak(files[`test_${preset}.hak`]);
  assert.equal(hak.length, 7);
  for (const entry of hak) assert.deepEqual(entry.data, files[entry.name]);
  const parsed = readAsciiMdl(files[`test_${preset}.mdl`]);
  for (const emitter of parsed.nodes.filter(node => node.type === 'emitter')) {
    const resref = textProperty(emitter, 'texture');
    const tga = readTga(files[`${resref}.tga`]);
    assert.equal(tga.width, 128); assert.equal(tga.height, 128);
    assert.equal(tga.rgba[3], 0);
    assert.ok(tga.rgba[(64 * 128 + 64) * 4 + 3] > 0);
    assert.ok(files[`${resref}.txi`]);
  }
});

test('unsupported enabled layers and native tails are rejected; disabled layer source survives', () => {
  for (const kind of ['ribbon', 'light'] as const) {
    const doc = makeDocument('empty'); doc.layers.push(makeLayer('unsupported', 'Unsupported', kind));
    assert.throws(() => buildCandidate(doc, 'invalid'), expectCode('UNSUPPORTED_EXPORT'));
    doc.layers[1].enabled = false;
    const built = buildCandidate(doc, 'disabled');
    assert.equal(JSON.parse(decode(built.files.find(file => file.name === 'effect-document.json')!.data)).layers[1].type, kind);
    assert.equal(built.validation.readback.layers.length, 1);
  }
  const doc = makeDocument('empty'); doc.duration = .5;
  assert.throws(() => buildCandidate(doc, 'tail_truncated'), expectCode('UNSUPPORTED_EXPORT'));
});

test('resrefs are never silently truncated or accepted as paths', () => {
  const doc = makeDocument('empty');
  for (const name of ['../escape', '123start', 'UPPER', 'name with space', 'x'.repeat(17), 'a\nnode dummy evil'])
    assert.throws(() => buildCandidate(doc, name), expectCode('INVALID_INPUT'));
  doc.layers[0].size = NaN;
  assert.throws(() => buildCandidate(doc, 'not_finite'), expectCode('INVALID_INPUT'));
});

test('ASCII reader rejects missing terminators, bad hierarchy, invalid keys and non-finite numbers', () => {
  for (const broken of [fixture.replace('donemodel fixture_vfx', ''),
    fixture.replace('parent offset_parent', 'parent missing'),
    fixture.replace('    0.125 7', '    0.125 NaN'),
    fixture.replace('    0.5 0', '    0.125 0'),
    fixture.replace('birthratekey 4', 'birthratekey 3'),
    fixture.replace('  event 0.125 detonate', '  event 5 detonate'),
    fixture.replace('parent fixture_vfx\n  position 1.25', 'parent sparks\n  position 1.25'),
  ]) assert.throws(() => readAsciiMdl(broken), expectCode('INVALID_FORMAT'));
});

test('TGA independent bottom-origin BGRA bytes become top-origin RGBA; bad lengths fail', () => {
  const bytes = new Uint8Array(18 + 16);
  bytes.set([0, 0, 2], 0); bytes[12] = 2; bytes[14] = 2; bytes[16] = 32; bytes[17] = 8;
  // Bottom row: blue/white. Top row: red/green. Alpha deliberately varies.
  bytes.set([255, 0, 0, 64, 255, 255, 255, 32, 0, 0, 255, 255, 0, 255, 0, 128], 18);
  const result = readTga(bytes);
  assert.deepEqual([...result.rgba], [255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 64, 255, 255, 255, 32]);
  assert.throws(() => readTga(bytes.subarray(0, bytes.length - 1)), expectCode('INVALID_FORMAT'));
  bytes[17] = 0x18;
  assert.throws(() => readTga(bytes), expectCode('INVALID_FORMAT'));
});

test('HAK independent binary layout, out-of-order resource IDs and bounds checks', () => {
  // Written directly from the V1.0 layout, without calling writeHak.
  const fixtureBytes = new Uint8Array(227), view = new DataView(fixtureBytes.buffer);
  fixtureBytes.set(new TextEncoder().encode('HAK V1.0'));
  view.setUint32(16, 2, true); view.setUint32(20, 160, true); view.setUint32(24, 160, true); view.setUint32(28, 208, true);
  fixtureBytes.set(new TextEncoder().encode('first'), 160); view.setUint32(176, 1, true); view.setUint16(180, 2002, true);
  fixtureBytes.set(new TextEncoder().encode('second'), 184); view.setUint32(200, 0, true); view.setUint16(204, 2022, true);
  view.setUint32(208, 224, true); view.setUint32(212, 1, true); view.setUint32(216, 225, true); view.setUint32(220, 2, true);
  fixtureBytes.set([65, 66, 67], 224);
  assert.deepEqual(readHak(fixtureBytes).map(file => [file.name, decode(file.data)]), [['first.mdl', 'BC'], ['second.txi', 'A']]);
  const outOfBounds = fixtureBytes.slice(); new DataView(outOfBounds.buffer).setUint32(220, 500, true);
  assert.throws(() => readHak(outOfBounds), expectCode('INVALID_FORMAT'));
  const overlap = fixtureBytes.slice(); new DataView(overlap.buffer).setUint32(216, 224, true);
  assert.throws(() => readHak(overlap), expectCode('INVALID_FORMAT'));
  const duplicateId = fixtureBytes.slice(); new DataView(duplicateId.buffer).setUint32(200, 1, true);
  assert.throws(() => readHak(duplicateId), expectCode('INVALID_FORMAT'));
  assert.throws(() => writeHak([{ name: 'same.mdl', data: new Uint8Array([1]) }, { name: 'same.mdl', data: new Uint8Array([2]) }]), expectCode('INVALID_FORMAT'));
});

test('HAK writer does not change any independently supplied payload byte', () => {
  const payloads = [{ name: 'fixture.mdl', data: new TextEncoder().encode(fixture) }, { name: 'fixture.txi', data: new Uint8Array([0, 255, 32, 13, 10]) }];
  const archive = writeHak(payloads);
  assert.deepEqual(readHak(archive), payloads);
  assert.deepEqual(archive, writeHak(payloads));
});

const meshFixture = readFileSync(new URL('./fixtures/independent-mesh.mdl', import.meta.url), 'utf8');
test('independent trimesh fixture reads real vertex/UV/face tables and all four controller widths', () => {
  const parsed = readAsciiMdl(new TextEncoder().encode(meshFixture));
  const mesh = parsed.nodes.find(node => node.name === 'panel')!;
  assert.deepEqual(mesh.tables.verts, [[-1, 0, 0], [1, 0, 0], [0, 0, 2]]);
  assert.deepEqual(mesh.tables.tverts, [[0, 0, 0], [1, 0, 0], [.5, 1, 0]]);
  assert.deepEqual(mesh.tables.faces, [[0, 1, 2, 1, 2, 0, 1, 0]]);
  assert.deepEqual(vector(mesh, 'orientation', 4), [0, 1, 0, Math.PI / 2]);
  const tracks = parsed.animations[0].nodes.find(node => node.name === 'panel')!.tracks;
  assert.deepEqual(sampleTrack(tracks.position, 1.5), [2, -1, 1.5]);
  assert.deepEqual(tracks.orientation[1], [.5, 0, 1, 0, Math.PI / 2]);
  assert.deepEqual(sampleTrack(tracks.scale, 1.5), [1.25]);
  assert.deepEqual(sampleTrack(tracks.alpha, 2.25), [.5]);
});

test('trimesh reader rejects invalid tables, vertex/UV indices, degeneracy and malformed controller widths', () => {
  for (const broken of [
    meshFixture.replace('verts 3', 'verts 4'),
    meshFixture.replace('    0 1 2 1 2 0 1 0', '    0 1 3 1 2 0 1 0'),
    meshFixture.replace('    0 1 2 1 2 0 1 0', '    0 1 2 1 3 0 1 0'),
    meshFixture.replace('    0 1 2 1 2 0 1 0', '    0 1 1 1 2 0 1 0'),
    meshFixture.replace('    0 1 2 1 2 0 1 0', '    0 1 2 1 2 0 1'),
    meshFixture.replace('    0 0 2', '    0 0 0'),
    meshFixture.replace('    2.5 0 0 1 3.141592653589793', '    2.5 0 0 3.141592653589793'),
    meshFixture.replace('    0.5 1.5', '    0.5 1.5 2'),
  ]) assert.throws(() => readAsciiMdl(broken), expectCode('INVALID_FORMAT'));
});

for (const kind of ['box', 'ring', 'custom'] as const) test(`${kind}: actual trimesh geometry survives candidate MDL and HAK without particle texture dependencies`, () => {
  const layer = makeMeshLayer('solid', 'Solid', kind), doc = meshDocument([layer]);
  const first = buildCandidate(doc, `mesh_${kind}`), second = buildCandidate(doc, `mesh_${kind}`);
  const files = unzipSync(zipCandidate(first));
  assert.deepEqual(zipCandidate(first), zipCandidate(second));
  const resources = readHak(files[`mesh_${kind}.hak`]);
  assert.equal(resources.length, 1);
  assert.deepEqual(resources[0].data, files[`mesh_${kind}.mdl`]);
  const mesh = readAsciiMdl(resources[0].data).nodes.find(node => node.type === 'trimesh')!;
  const geometry = buildMeshGeometry(layer.geometry);
  assert.deepEqual(mesh.tables.verts, geometry.vertices);
  assert.deepEqual(mesh.tables.faces.map(row => row.slice(0, 3)), geometry.faces);
  assert.equal(mesh.tables.verts.length, kind === 'box' ? 8 : kind === 'ring' ? 96 : 3);
  assert.equal(mesh.tables.faces.length, kind === 'box' ? 12 : kind === 'ring' ? 96 : 1);
  assert.equal(textProperty(mesh, 'bitmap'), 'NULL');
  assert.equal(numeric(mesh, 'alpha'), 0);
  assert.equal(first.validation.readback.layers.length, 0);
  assert.equal(first.validation.readback.textures.length, 0);
  assert.equal(first.validation.readback.meshes[0].geometryKind, kind);
  assert.equal(first.validation.nativeVerified, false);
  assert.ok(first.validation.diagnostics.some(item => item.code === 'MESH_NATIVE_UNQUALIFIED'));
  assert.deepEqual(JSON.parse(decode(files['effect-document.json'])), doc);
});

test('mesh animation writes local time plus start, held transforms, exact axis-angle endpoints and bounded visibility', () => {
  const layer: MeshLayer = { ...makeMeshLayer('moving'), start: .25, duration: 1.5,
    position: [1, -2, 3], orientation: [1, 0, 0, .2], scale: .75, alpha: .8,
    animation: {
      position: [{ time: .5, value: [1, -2, 1] }, { time: 1.5, value: [2, -2, 0] }],
      orientation: [{ time: 0, value: [0, 0, 1, 0] }, { time: .75, value: [0, 1, 0, Math.PI / 2] }, { time: 1.5, value: [0, 0, 1, Math.PI] }],
      scale: [{ time: .5, value: 2 }, { time: 1, value: .5 }],
      alpha: [{ time: .4, value: .5 }, { time: 1.5, value: 0 }],
    } };
  const built = buildCandidate(meshDocument([layer]), 'moving_mesh');
  const readback = built.validation.readback.meshes[0];
  assert.deepEqual(readback.positionKeys, [[0, 1, -2, 3], [.25, 1, -2, 3], [.75, 1, -2, 1], [1.75, 2, -2, 0], [3, 2, -2, 0]]);
  assert.deepEqual(sampleTrack(readback.positionKeys, .5), [1, -2, 2]);
  assert.deepEqual(readback.orientation, layer.orientation);
  assert.deepEqual(readback.orientationKeys.find(row => row[0] === 1), [1, 0, 1, 0, Math.PI / 2]);
  assert.deepEqual(sampleTrack(readback.scaleKeys, 2), [.5]);
  assert.equal(sampleTrack(readback.alphaKeys, .2)[0], 0);
  assert.equal(sampleTrack(readback.alphaKeys, .25)[0], 0);
  assert.equal(sampleTrack(readback.alphaKeys, 1.8)[0], 0);
  assert.equal(sampleTrack(readback.alphaKeys, .65)[0], .5);
  assert.ok(Math.abs(sampleTrack(readback.alphaKeys, .251)[0] - (.8 + (.5 - .8) * .001 / .4)) < 1e-9);
  assert.deepEqual(readback.visibilityRampSeconds, { start: .001, end: 0 });
});

test('mesh visibility micro-ramps preserve close interior alpha keys and zero-boundary tracks need no ramps', () => {
  const layer: MeshLayer = { ...makeMeshLayer('ramp'), start: .5, duration: .01,
    animation: { alpha: [{ time: .0001, value: .7 }, { time: .0099, value: .9 }] } };
  let built = buildCandidate(meshDocument([layer]), 'mesh_ramp');
  let rb = built.validation.readback.meshes[0];
  assert.equal(sampleTrack(rb.alphaKeys, .5001)[0], .7);
  assert.equal(sampleTrack(rb.alphaKeys, .5099)[0], .9);
  assert.ok(rb.visibilityRampSeconds.start <= .00005 + 1e-12);
  assert.ok(rb.visibilityRampSeconds.end <= .00005 + 1e-12);
  layer.alpha = 0;
  layer.animation.alpha = [{ time: .005, value: 1 }, { time: .01, value: 0 }];
  built = buildCandidate(meshDocument([layer]), 'no_mesh_ramp'); rb = built.validation.readback.meshes[0];
  assert.deepEqual(rb.visibilityRampSeconds, { start: 0, end: 0 });
  assert.equal(built.validation.diagnostics.some(d => d.code === 'MESH_VISIBILITY_RAMP'), false);
});

test('mixed mesh + emitter document retains independent detonate schedule and resource dependencies', () => {
  const doc = makeEffectDocument('coil'); doc.schemaVersion = 2;
  doc.layers.splice(1, 0, { ...makeMeshLayer('ring', 'Ring', 'ring'), start: .2, duration: 1 });
  const built = buildCandidate(doc, 'mixed_mesh');
  assert.equal(built.validation.readback.meshes.length, 1);
  assert.equal(built.validation.readback.layers.length, 3);
  assert.equal(built.validation.readback.hakResourceCount, 7);
  assert.deepEqual(built.validation.readback.detonateEvents, [.1]);
  assert.ok(built.validation.checks.meshGeometryRead);
  assert.ok(built.validation.checks.meshControllerKeysRead);
});

test('mesh export rejects malformed geometry, unsupported tracks, invalid timeline and unrepresentable float32 times', () => {
  const invalid = (edit: (layer: MeshLayer) => void, code = 'INVALID_INPUT') => {
    const layer = makeMeshLayer('bad'); edit(layer);
    assert.throws(() => buildCandidate(meshDocument([layer]), 'invalid_mesh'), expectCode(code));
  };
  invalid(layer => { layer.geometry = { kind: 'custom', vertices: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], faces: [[0, 1, 2]] }; });
  invalid(layer => { layer.geometry = { kind: 'custom', vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 3]] }; });
  invalid(layer => { layer.geometry = { kind: 'ring', innerRadius: 1, outerRadius: 1, segments: 16 }; });
  invalid(layer => { layer.orientation = [0, 0, 2, 0]; });
  invalid(layer => { layer.animation.scale = [{ time: 1, value: 1 }, { time: 1, value: 2 }]; });
  invalid(layer => { layer.animation.alpha = [{ time: 3.1, value: .5 }]; });
  invalid(layer => { (layer.animation as Record<string, unknown>).unsupported = []; }, 'UNSUPPORTED_EXPORT');
  invalid(layer => { layer.start = 1; }, 'UNSUPPORTED_EXPORT');
  invalid(layer => { layer.animation.position = [{ time: 1, value: [0, 0, 0] }, { time: 1 + 1e-10, value: [1, 0, 0] }]; }, 'UNSUPPORTED_EXPORT');
  const wrongVersion = meshDocument([makeMeshLayer('version')]); wrongVersion.schemaVersion = 1;
  assert.throws(() => buildCandidate(wrongVersion, 'invalid_mesh'), expectCode('INVALID_INPUT'));
});

test('mesh empty tracks preserve base values and decimal lifetime ending at document boundary exports', () => {
  const layer: MeshLayer = { ...makeMeshLayer('decimal'), start: .1, duration: .2, animation: { position: [], orientation: [], scale: [], alpha: [] } };
  const built = buildCandidate(meshDocument([layer], .3), 'decimal_mesh');
  assert.equal(built.validation.readback.meshes[0].alphaKeys.at(-1)![0], .3);
});

test('mesh candidate readback fits the published executable result schema including bounded ramp durations', () => {
  const built = buildCandidate(meshDocument([{ ...makeMeshLayer('schema'), start: .25, duration: 1.5 }]), 'schema_mesh');
  const job = { id: 'job-id', jobId: 'job-id', projectId: 'project-id', revision: 1, actorId: 'owner',
    type: 'candidate.build', status: 'running', createdAt: '2026-09-05T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z', artifacts: [],
    metadata: { modelName: 'schema_mesh', nativeVerified: false, validation: built.validation } };
  validateOperationOutput('jobs.get', job);
  const invalid = structuredClone(job);
  invalid.metadata.validation.readback.meshes[0].orientationKeys[0].pop();
  assert.throws(() => validateOperationOutput('jobs.get', invalid), /niepoprawny wynik/);
});

/** Independently assembled PNG fixture: native zlib + bytewise CRC, no Studio
 * PNG encoder/decoder generates the expected pixels or the source bytes. */
function textureFixture(width = 8, height = 16, alpha?: number) {
  const rgba = Uint8Array.from({ length: width * height * 4 }, (_, index) => {
    const pixel = Math.floor(index / 4), x = pixel % width, y = Math.floor(pixel / width);
    return index % 4 === 0 ? x * 31 : index % 4 === 1 ? y * 13 : index % 4 === 2 ? (x * 11 + y * 7 + 29) % 256 : alpha ?? (x * 17 + y * 19) % 256;
  });
  const chunk = (type: string, data: Uint8Array) => {
    const block = Buffer.alloc(12 + data.length); block.writeUInt32BE(data.length);
    block.write(type, 4, 'ascii'); block.set(data, 8);
    let crc = 0xffffffff;
    for (const byte of block.subarray(4, block.length - 4)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    block.writeUInt32BE((crc ^ 0xffffffff) >>> 0, block.length - 4); return block;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', new Uint8Array())]);
  return { rgba, png, asset: createTextureAsset('asymmetric.png', png.toString('base64')) };
}
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
function validateCandidateDto(validation: ReturnType<typeof buildCandidate>['validation']) {
  validateOperationOutput('jobs.get', { id: 'job-id', jobId: 'job-id', projectId: 'project-id', revision: 1, actorId: 'owner',
    type: 'candidate.build', status: 'running', createdAt: '2026-09-05T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z', artifacts: [],
    metadata: { modelName: validation.modelName, nativeVerified: false, validation } });
}

test('0.14.2 receipts require bottom-first pixel evidence while historic top-first receipts stay readable', () => {
  const report = buildCandidate(makeDocument('empty'), 'origin_contract').validation;
  validateCandidateDto(report);
  for (const mutate of [
    (t: Record<string, unknown>) => { t.origin = 'top-left'; },
    (t: Record<string, unknown>) => { delete t.nwnBottomFirstRgbaSha256; },
    (t: Record<string, unknown>) => { t.generator = 'shared-rgba-1'; },
  ]) {
    const invalid = structuredClone(report); mutate(invalid.readback.textures[0]);
    assert.throws(() => validateCandidateDto(invalid));
  }
  const historic = structuredClone(report); historic.exporterVersion = 'nwn-ascii-vfx-0.14.1';
  historic.readback.textures.forEach(t => { t.origin = 'top-left'; t.generator = 'shared-rgba-1'; delete t.nwnBottomFirstRgbaSha256; });
  validateCandidateDto(historic);
});

test('asymmetric imported RGBA survives textured mesh UV seams, emitter, TGA, TXI, HAK and ZIP byte-for-byte', () => {
  const { asset, rgba, png } = textureFixture(), unused = textureFixture(8, 8, 255).asset;
  const mesh: MeshLayer = { ...makeMeshLayer('panel', 'Panel', 'custom'), texture: `asset:${asset.id}`, blend: 'normal',
    geometry: { kind: 'custom', vertices: [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]], faces: [[0, 1, 2], [0, 2, 3]],
      uv: [[0, 0], [1, 0], [1, 1], [.25, .25], [.75, .75], [0, 1]], uvFaces: [[0, 1, 2], [3, 4, 5]] } };
  const emitter = { ...makeLayer('image-emitter'), texture: `asset:${asset.id}` as const, blend: 'normal' as const };
  const document: EffectDocument = { ...makeEffectDocument('empty'), schemaVersion: 3, assets: [asset, unused], layers: [mesh, emitter] };
  const candidate = buildCandidate(document, 'rgba_shared'), files = unzipSync(zipCandidate(candidate));
  const hak = readHak(files['rgba_shared.hak']), mdl = readAsciiMdl(files['rgba_shared.mdl']);
  assert.equal(hak.length, 3); for (const resource of hak) assert.deepEqual(resource.data, files[resource.name]);
  const nativeMesh = mdl.nodes.find(node => node.type === 'trimesh')!, nativeEmitter = mdl.nodes.find(node => node.type === 'emitter')!;
  const ref = textProperty(nativeMesh, 'bitmap'); assert.equal(textProperty(nativeEmitter, 'texture'), ref);
  assert.equal(textProperty(nativeEmitter, 'blend'), 'Normal');
  assert.deepEqual(nativeMesh.tables.tverts, mesh.geometry.kind === 'custom' ? mesh.geometry.uv!.map(v => [...v, 0]) : []);
  assert.deepEqual(nativeMesh.tables.faces, [[0, 1, 2, 0, 0, 1, 2, 0], [0, 2, 3, 0, 3, 4, 5, 0]]);
  const tga = readTga(files[`${ref}.tga`]);
  assert.deepEqual(tga.rgba, rgba); assert.equal(tga.width, 8); assert.equal(tga.height, 16); assert.equal(tga.origin, 'bottom-left');
  assert.deepEqual([...tga.rgba.slice(0, 4)], [0, 0, 29, 0]); // Hidden RGB survives zero alpha.
  assert.deepEqual(readTxi(files[`${ref}.txi`]), { blending: 'default', mipmap: 1, filter: 1 });
  const report = candidate.validation;
  assert.equal(report.readback.textures[0].rgbaSha256, digest(rgba));
  assert.deepEqual(report.readback.textures[0].sourceRefs, [`asset:${asset.id}`]);
  assert.equal(report.assets[0].id, digest(png)); assert.equal(report.assets[0].referenced, true);
  assert.deepEqual(report.assets[0].resources, [`${ref}.tga`, `${ref}.txi`]);
  assert.equal(report.assets[1].referenced, false); assert.deepEqual(report.assets[1].resources, []);
  assert.equal(Object.hasOwn(report.assets[0], 'pngBase64'), false);
  assert.deepEqual(JSON.parse(decode(files['effect-document.json'])), document);
  assert.equal(report.nativeVerified, false); validateCandidateDto(report);
});

test('same image with normal/additive gets distinct native materials and never overwrites TXI', () => {
  const { asset, rgba } = textureFixture();
  const mesh = { ...makeMeshLayer('image-ring', 'Ring', 'ring'), texture: `asset:${asset.id}` as const, blend: 'additive' as const };
  const document: EffectDocument = { ...makeEffectDocument('empty'), schemaVersion: 3, assets: [asset], layers: [
    { ...makeLayer('normal'), texture: `asset:${asset.id}`, blend: 'normal' },
    { ...makeLayer('additive'), texture: `asset:${asset.id}`, blend: 'additive' }, mesh,
    { ...makeMeshLayer('white-additive', 'White', 'custom'), blend: 'additive' },
  ] };
  const candidate = buildCandidate(document, 'blend_variants'), resources = readHak(candidate.files.find(file => file.name.endsWith('.hak'))!.data);
  const parsed = readAsciiMdl(resources.find(file => file.name.endsWith('.mdl'))!.data), emitters = parsed.nodes.filter(node => node.type === 'emitter');
  const refs = emitters.map(node => textProperty(node, 'texture')); assert.notEqual(refs[0], refs[1]);
  assert.deepEqual(emitters.map(node => textProperty(node, 'blend')), ['Normal', 'Lighten']);
  for (const [index, ref] of refs.entries()) {
    assert.deepEqual(readTga(resources.find(file => file.name === `${ref}.tga`)!.data).rgba, rgba);
    assert.equal(readTxi(resources.find(file => file.name === `${ref}.txi`)!.data).blending, index ? 'additive' : 'default');
  }
  const meshes = parsed.nodes.filter(node => node.type === 'trimesh');
  assert.equal(textProperty(meshes[0], 'bitmap'), refs[1]);
  const whiteRef = textProperty(meshes[1], 'bitmap'); assert.notEqual(whiteRef, 'NULL');
  assert.ok(readTga(resources.find(file => file.name === `${whiteRef}.tga`)!.data).rgba.every(v => v === 255));
  assert.equal(readTxi(resources.find(file => file.name === `${whiteRef}.txi`)!.data).blending, 'additive');
  assert.equal(candidate.validation.assets[0].resources.length, 4);
  assert.deepEqual(candidate.validation.readback.meshes.map(mesh => mesh.blend), ['additive', 'additive']);
  validateCandidateDto(candidate.validation);
});

test('procedural textures retain released TGA pixels and share their source with preview', () => {
  // Hashes recorded from the immutable Studio 0.3 acceptance artifact, before
  // the generator was moved from the exporter into shared core.
  const previous = { spark: 'a9d2f22c6080e3749e6dd8261e948147496c3e60e7f254b7decaa3fae530c0a5', smoke: '9bfb676d1017774c7d0b7be0ce28a032e3da8aa821728b7656f66871c1883065' };
  const document = makeDocument('coil'), candidate = buildCandidate(document, 'builtin_pixels');
  for (const texture of ['spark', 'smoke', 'glow'] as const) {
    const report = candidate.validation.readback.textures.find(item => (item.sourceRefs as string[]).includes(texture))!;
    const bytes = candidate.files.find(file => file.name === report.name)!.data;
    assert.deepEqual(readTga(bytes).rgba, resolveTexture(document, texture).rgba);
    // 0.14.2 changes only serialization to bottom-first rows for NWN. Restore
    // the released top-first layout before comparing the historical hashes.
    if (texture !== 'glow') {
      const { width, height, origin } = readTga(bytes);
      assert.equal(origin, 'bottom-left');
      const historical = Uint8Array.from(bytes), stride = width * 4;
      historical[17] = 0x28;
      for (let y = 0; y < height; y++) historical.set(bytes.subarray(18 + (height - 1 - y) * stride, 18 + (height - y) * stride), 18 + y * stride);
      assert.equal(digest(historical), previous[texture]);
    }
  }
});

test('planar ring/disk UV and box face seams are serialized without welding texture indices', () => {
  for (const kind of ['box', 'ring', 'disk'] as const) {
    const layer = { ...makeMeshLayer('uv', 'UV', kind === 'box' ? 'box' : 'ring'), texture: 'glow' as const };
    if (kind === 'disk' && layer.geometry.kind === 'ring') layer.geometry.innerRadius = 0;
    const document = { ...meshDocument([layer]), schemaVersion: 3 as const }, candidate = buildCandidate(document, `uv_${kind}`);
    const mesh = candidate.validation.readback.meshes[0];
    if (kind === 'box') { assert.equal(mesh.vertices.length, 8); assert.equal(mesh.uv.length, 24); assert.ok(mesh.uvFaces.flat().some(i => i >= 8)); }
    else mesh.vertices.forEach(([x, y], index) => assert.deepEqual(mesh.uv[index], [.5 + x / 2, .5 + y / 2]));
  }
});

test('explicit shared lifetime midpoint preserves RGB/alpha/size values and fallback stays a straight line', () => {
  const doc = makeDocument('empty'); doc.schemaVersion = 3;
  Object.assign(doc.layers[0], { color: '#ff0000', midColor: '#00ff00', endColor: '#0000ff', alpha: .2, midAlpha: .95, endAlpha: 0, size: .1, midSize: .7, endSize: .03, midPercent: .23 });
  let candidate = buildCandidate(doc, 'authored_middle'), rb = candidate.validation.readback.layers[0];
  assert.deepEqual([rb.colorStart, rb.colorMid, rb.colorEnd], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.deepEqual([rb.percentStart, rb.percentMid, rb.percentEnd], [0, .23, 1]);
  assert.deepEqual([rb.alphaStart, rb.alphaMid, rb.alphaEnd], [.2, .95, 0]);
  assert.deepEqual([rb.sizeStart, rb.sizeMid, rb.sizeEnd], [.1, .7, .03]);
  const mdl = readAsciiMdl(candidate.files.find(file => file.name.endsWith('.mdl'))!.data), emitter = mdl.nodes.find(node => node.type === 'emitter')!;
  assert.equal(numeric(emitter, 'percentMid'), .23); assert.deepEqual(vector(emitter, 'colorMid'), [0, 1, 0]);
  validateCandidateDto(candidate.validation);
  delete doc.layers[0].midColor; delete doc.layers[0].midAlpha; delete doc.layers[0].midSize;
  candidate = buildCandidate(doc, 'linear_middle'); rb = candidate.validation.readback.layers[0];
  assert.deepEqual(rb.colorMid, [.77, 0, .23]);
  assert.equal(rb.alphaMid, .2 + (0 - .2) * .23); assert.equal(rb.sizeMid, .1 + (.03 - .1) * .23);
});

test('missing/corrupt assets, malformed custom UV and independent age percentages fail explicitly', () => {
  const { asset } = textureFixture(), base: EffectDocument = { ...makeEffectDocument('empty'), schemaVersion: 3, assets: [asset], layers: [{ ...makeLayer('image'), texture: `asset:${asset.id}` }] };
  let doc = structuredClone(base); doc.assets = [];
  assert.throws(() => buildCandidate(doc, 'missing_image'), expectCode('MISSING_ASSET'));
  doc = structuredClone(base); doc.layers[0].enabled = false; doc.layers.push(makeLayer('enabled')); doc.assets = [];
  assert.throws(() => buildCandidate(doc, 'missing_disabled'), expectCode('MISSING_ASSET'));
  doc = structuredClone(base); doc.assets![0].width = 16;
  assert.throws(() => buildCandidate(doc, 'corrupt_asset'), expectCode('INVALID_TEXTURE'));
  doc = structuredClone(base); (doc.layers[0] as EmitterLayer).midPercent = 0;
  assert.throws(() => buildCandidate(doc, 'bad_percent'), expectCode('INVALID_INPUT'));
  doc = structuredClone(base); (doc.layers[0] as any).colorMidPercent = .3;
  assert.throws(() => buildCandidate(doc, 'different_mids'), expectCode('UNSUPPORTED_EXPORT'));
  for (const uvCase of ['missing', 'index', 'count', 'outside'] as const) {
    const mesh = makeMeshLayer('bad-uv', 'UV', 'custom'); mesh.texture = `asset:${asset.id}`;
    if (mesh.geometry.kind !== 'custom') throw Error('fixture');
    if (uvCase !== 'missing') { mesh.geometry.uv = [[0, 0], [1, 0], [.5, 1]]; mesh.geometry.uvFaces = [[0, 1, 2]]; }
    if (uvCase === 'index') mesh.geometry.uvFaces![0][2] = 3;
    if (uvCase === 'count') mesh.geometry.uvFaces!.push([0, 1, 2]);
    if (uvCase === 'outside') mesh.geometry.uv![0][0] = -1;
    assert.throws(() => buildCandidate({ ...base, layers: [mesh] }, 'bad_uv'), expectCode('INVALID_INPUT'));
  }
});

test('independent TXI parser rejects unsupported blend, duplicate and missing fields', () => {
  assert.deepEqual(readTxi('filter 1\r\nblending additive\r\nmipmap 1\r\n'), { blending: 'additive', mipmap: 1, filter: 1 });
  for (const txi of ['blending normal\nmipmap 1\nfilter 1', 'blending punchthrough\nmipmap 1\nfilter 1', 'blending default\nmipmap 1',
    'blending default\nmipmap 1\nfilter 1\nblending additive', 'blending default\nmipmap 1\nfilter 1\nproceduretype cycle'])
    assert.throws(() => readTxi(txi), expectCode('INVALID_FORMAT'));
});

test('fully opaque or transparent valid imported RGBA is preserved instead of imposing procedural alpha rules', () => {
  for (const alpha of [0, 255]) {
    const { asset, rgba } = textureFixture(8, 8, alpha);
    const doc = { ...makeEffectDocument('empty'), schemaVersion: 3 as const, assets: [asset], layers: [{ ...makeLayer('alpha'), texture: `asset:${asset.id}` as const }] };
    const candidate = buildCandidate(doc, 'alpha_texture'), tga = candidate.files.find(file => file.name.endsWith('.tga'))!;
    assert.deepEqual(readTga(tga.data).rgba, rgba);
    assert.equal(candidate.validation.readback.textures[0].minAlpha, alpha); assert.equal(candidate.validation.readback.textures[0].maxAlpha, alpha);
  }
});
