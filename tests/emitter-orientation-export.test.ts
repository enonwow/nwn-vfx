import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DomainError, makeDocument, makeLayer, type AxisAngle, type EffectDocument, type Vec3 } from '../packages/core/src/model.js';
import { prepareEmitterOrientation, sampleEmitterPosition } from '../packages/core/src/simulation.js';
import { validateOperationOutput } from '../packages/contracts/src/schema.js';
import { buildCandidate, numeric, readAsciiMdl, readHak, textProperty, vector } from '../packages/nwn-format/src/index.js';

const equalVector = (actual: number[], expected: number[], tolerance = 1e-11) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, `${actual} != ${expected}`));
};
const cross = (a: number[], b: number[]) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
// Independent quaternion calculation from the serialized axis-angle. The preview
// uses a prepared matrix; neither its helper nor the writer supplies this result.
function rotateFromMdl(orientation: number[], direction: number[]): number[] {
  const length = Math.hypot(...orientation.slice(0, 3));
  const sine = Math.sin(orientation[3] / 2), cosine = Math.cos(orientation[3] / 2);
  const imaginary = orientation.slice(0, 3).map(value => value / length * sine);
  const first = cross(imaginary, direction), second = cross(imaginary, first);
  return direction.map((value, i) => value + 2 * (cosine * first[i] + second[i]));
}

test('independent MDL fixture retains emitter-local axis-angle, neutral parent and signed world-space mass flags', () => {
  const parsed = readAsciiMdl(readFileSync(new URL('./fixtures/independent-emitter-orientation.mdl', import.meta.url)));
  const emitter = parsed.nodes.find(node => node.name === 'plume')!;
  const parent = parsed.nodes.find(node => node.name === textProperty(emitter, 'parent'))!;
  assert.deepEqual(vector(emitter, 'orientation', 4), [1, 0, 0, Math.PI / 2]);
  assert.deepEqual(vector(parent, 'orientation', 4), [0, 0, 1, 0]);
  assert.deepEqual(vector(parent, 'position'), [1, -2, 3]);
  equalVector(rotateFromMdl(vector(emitter, 'orientation', 4), [0, 0, 1]), [0, -1, 0]);
  assert.equal(numeric(parent, 'scale'), 2);
  assert.equal(numeric(emitter, 'mass'), -.25);
  for (const field of ['grav', 'inherit', 'inheritvel', 'inherit_local', 'inherit_part']) assert.equal(numeric(emitter, field), 0);
  assert.equal(parsed.animations[0].nodes.some(node => node.tracks.orientation), false);
});

test('neutral orientation retains historical MDL apart from versioned textures and the explicit single-burst correction', () => {
  // Captured from the 0.4.0 exporter before the orientation writer was changed.
  const historicalHashes = {
    empty: '36678b48f29b7448759f6853a61e0e9173d68fa8f3a2849047219b71aa4e160d',
    coil: 'd83866d66505e3b4c7361212ba35d9ad64b318a93e1886eeaa59e7a6f1ee5ece',
    vial: '126155f4343a0230dcf02c2d754113415438ebff93e61f9c074b424240b2ef32',
  };
  for (const [preset, expected] of Object.entries(historicalHashes)) {
    const oldDocument = makeDocument(preset), neutralDocument = structuredClone(oldDocument);
    neutralDocument.schemaVersion = 4;
    neutralDocument.layers.forEach(layer => { layer.orientation = [0, 0, 1, 0]; });
    const candidate = buildCandidate(oldDocument, 'orient_legacy');
    const oldMdl = candidate.files.find(file => file.name.endsWith('.mdl'))!.data;
    const neutralMdl = buildCandidate(neutralDocument, 'orient_legacy').files.find(file => file.name.endsWith('.mdl'))!.data;
    // The 0.14.2 bottom-first TGA payload has a new content-derived resref.
    // Restore the historical resrefs, then retain the original MDL byte check.
    let historicalMdl = new TextDecoder().decode(oldMdl);
    for (const file of candidate.files.filter(file => file.name.endsWith('.tga'))) {
      const bytes = file.data, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint16(12, true), height = view.getUint16(14, true), stride = width * 4;
      assert.equal(bytes[17], 0x08);
      const historical = Uint8Array.from(bytes); historical[17] = 0x28;
      for (let y = 0; y < height; y++) historical.set(bytes.subarray(18 + (height - 1 - y) * stride, 18 + (height - y) * stride), 18 + y * stride);
      const resref = file.name.slice(0, -4), txi = candidate.files.find(file => file.name === `${resref}.txi`)!.data;
      const historicalRef = 'vfx_' + createHash('sha256').update(historical).update(txi).digest('hex').slice(0, 12);
      historicalMdl = historicalMdl.replaceAll(resref, historicalRef);
    }
    // 0.21.1 deliberately changes only base/animated birthrate for one shared
    // Explosion start. Restore that released gate for this unrelated rotation
    // regression; emission.test.ts verifies the new constant-count behavior.
    const bursts=oldDocument.layers.filter(l=>l.enabled&&l.type==='emitter'&&l.update==='Explosion');
    if(new Set(bursts.map(l=>l.type==='emitter'?l.start:0)).size===1){
      const enabled=oldDocument.layers.filter(l=>l.enabled);
      historicalMdl=historicalMdl.replace(/node emitter em_(\d+)\n[\s\S]*?endnode\n/g,(block,index)=>{
        const layer=enabled[Number(index)];if(layer.type!=='emitter'||layer.update!=='Explosion')return block;
        if(block.includes('  birthrate '))return block.replace(/  birthrate [^\n]+/,'  birthrate 0');
        const times=[...new Set([0,layer.start,oldDocument.duration])].sort((a,b)=>a-b);
        const keys=`  birthratekey ${times.length}\n${times.map(t=>`    ${t} ${t===layer.start?layer.count:0}`).join('\n')}\n  endlist`;
        return block.replace(/  birthratekey [\s\S]*?  endlist/,keys);
      });
    }
    assert.equal(createHash('sha256').update(historicalMdl).digest('hex'), expected, preset);
    assert.deepEqual(neutralMdl, oldMdl, preset);
  }
});

test('six launch axes survive actual MDL/HAK readback; signed gravity remains world Z in the shared preview', () => {
  const cases: Array<{ orientation: AxisAngle; direction: Vec3 }> = [
    { orientation: [0, 0, 1, 0], direction: [0, 0, 1] },
    { orientation: [1, 0, 0, Math.PI], direction: [0, 0, -1] },
    { orientation: [0, 1, 0, Math.PI / 2], direction: [1, 0, 0] },
    { orientation: [0, 1, 0, -Math.PI / 2], direction: [-1, 0, 0] },
    { orientation: [1, 0, 0, -Math.PI / 2], direction: [0, 1, 0] },
    { orientation: [1, 0, 0, Math.PI / 2], direction: [0, -1, 0] },
  ];
  for (const gravity of [-1.5, 0, 2]) for (const [index, { orientation, direction }] of cases.entries()) {
    const layer = { ...makeLayer('direction'), orientation, gravity, position: [1, -2, 3] as Vec3, scale: 2.5, speed: 3, spread: .4 };
    const document: EffectDocument = { ...makeDocument('empty'), schemaVersion: 4, layers: [layer] };
    const candidate = buildCandidate(document, 'launch_case');
    const mdlBytes = candidate.files.find(file => file.name === 'launch_case.mdl')!.data;
    const parsed = readAsciiMdl(mdlBytes), emitter = parsed.nodes.find(node => node.type === 'emitter')!;
    const axisAngle = vector(emitter, 'orientation', 4);
    equalVector(rotateFromMdl(axisAngle, [0, 0, 1]), direction);
    assert.deepEqual(axisAngle, orientation);
    assert.equal(numeric(emitter, 'mass'), gravity);
    assert.equal(numeric(emitter, 'velocity'), 3);
    assert.equal(numeric(emitter, 'spread'), .4);
    for (const field of ['grav', 'inherit', 'inheritvel', 'inherit_local', 'inherit_part']) assert.equal(numeric(emitter, field), 0);
    const hakMdl = readHak(candidate.files.find(file => file.name.endsWith('.hak'))!.data).find(file => file.name.endsWith('.mdl'))!.data;
    assert.deepEqual(hakMdl, mdlBytes);
    const readback = candidate.validation.readback.layers[0];
    assert.deepEqual(readback.orientation, orientation);
    assert.deepEqual(readback.parentOrientation, [0, 0, 1, 0]);
    assert.equal(candidate.validation.nativeVerified, false);
    assert.equal(candidate.validation.checks.emitterOrientationRead, true);
    assert.equal(candidate.validation.checks.emitterWorldSpaceFlagsRead, true);
    assert.ok(candidate.validation.diagnostics.some(entry => entry.code === 'EMITTER_ORIENTATION_NATIVE_UNQUALIFIED'));
    validateOperationOutput('jobs.get', { id: `direction-${index}`, jobId: `direction-${index}`, projectId: 'fixture-project', revision: 1, actorId: 'owner',
      type: 'candidate.build', status: 'running', createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z', artifacts: [],
      metadata: { modelName: 'launch_case', nativeVerified: false, validation: candidate.validation } });
    for (const [azimuth, theta, age] of [[0, 0, .5], [.7, .2, .6], [2.4, .4, .8]]) {
      const local = [Math.cos(azimuth)*Math.sin(theta)*3, Math.sin(azimuth)*Math.sin(theta)*3, Math.cos(theta)*3];
      const rotated = rotateFromMdl(axisAngle, local);
      const expected = rotated.map((value, i) => layer.position[i] + layer.scale * (value * age - (i === 2 ? .5 * gravity * age * age : 0)));
      equalVector(sampleEmitterPosition(layer, age, azimuth, theta, 3, prepareEmitterOrientation(layer)), expected);
    }
  }
});

test('arbitrary unit axis and extreme allowed radians stay lossless without normalizing the source bytes', () => {
  for (const angle of [-8 * Math.PI, -.8, 8 * Math.PI]) {
    const orientation: AxisAngle = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3), angle];
    const layer = { ...makeLayer('diagonal'), orientation };
    const candidate = buildCandidate({ ...makeDocument('empty'), schemaVersion: 4, layers: [layer] }, 'diagonal');
    const emitter = readAsciiMdl(candidate.files.find(file => file.name.endsWith('.mdl'))!.data).nodes.find(node => node.type === 'emitter')!;
    assert.deepEqual(vector(emitter, 'orientation', 4), orientation);
    const source = JSON.parse(new TextDecoder().decode(candidate.files.find(file => file.name === 'effect-document.json')!.data));
    assert.deepEqual(source.layers[0].orientation, orientation);
    const rotated = rotateFromMdl(vector(emitter, 'orientation', 4), [0, 0, layer.speed]);
    equalVector(sampleEmitterPosition(layer, .4, 0, 0, layer.speed), rotated.map((value, i) => layer.position[i] + (value * .4 - (i === 2 ? .5 * layer.gravity * .4 * .4 : 0)) * layer.scale));
  }
});

test('emitter orientation rejects old document versions, invalid axes and malformed non-finite data', () => {
  const invalid = (orientation: unknown, schemaVersion: EffectDocument['schemaVersion'] = 4) => {
    const layer = { ...makeLayer('invalid'), orientation };
    assert.throws(() => buildCandidate({ ...makeDocument('empty'), schemaVersion, layers: [layer] } as EffectDocument, 'bad_orientation'),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT');
  };
  for (const version of [1, 2, 3] as const) invalid([0, 0, 1, 0], version);
  for (const orientation of [null, [], [0, 0, 1], [0, 0, 0, 0], [0, 0, 2, .1], [0, 0, 1, 8*Math.PI + .0001], [0, 0, 1, Infinity], [NaN, 0, 1, 0], ['0', 0, 1, 0], new Array(4)]) invalid(orientation);
});
