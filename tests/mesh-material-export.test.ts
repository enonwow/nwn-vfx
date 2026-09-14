import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeDocument, makeMeshLayer, type MeshLayer } from '../packages/core/src/model.js';
import { buildCandidate } from '../packages/nwn-format/src/index.js';
import { readAsciiMdl, vector } from '../packages/nwn-format/src/mdl-reader.js';
import { readbackMesh } from '../packages/nwn-format/src/mesh-readback.js';
import { writeMeshNodes } from '../packages/nwn-format/src/mesh-writer.js';
import { readHak } from '../packages/nwn-format/src/binary.js';

test('omitted material keeps exact pre-material mesh MDL/controller bytes', () => {
  const layer = { ...makeMeshLayer('material_mesh'), color: '#ab7843', duration: 2 };
  const value = writeMeshNodes(layer, 'matfixture', 'mesh_node', 'mesh_parent', 3);
  assert.equal(createHash('sha256').update(value.geometry + value.animation).digest('hex'),
    'e556ce7a9066a8a5b050043c5c80c6f788fdbfd81b32b652d63ac991b1617b5e');
});

test('actual candidate and HAK preserve separate diffuse and self illumination', () => {
  const layer: MeshLayer = { ...makeMeshLayer('stone'), material: { diffuse: '#804020', selfIllumination: '#102030' } };
  const result = buildCandidate({ ...makeDocument('empty'), schemaVersion: 5, layers: [layer] }, 'materialtest');
  const mdl = result.files.find(file => file.name === 'materialtest.mdl')!;
  const parsed = readAsciiMdl(mdl.data), mesh = parsed.nodes.find(node => node.type === 'trimesh')!;
  assert.deepEqual(vector(mesh, 'diffuse'), [128 / 255, 64 / 255, 32 / 255]);
  assert.deepEqual(vector(mesh, 'selfillumcolor'), [16 / 255, 32 / 255, 48 / 255]);
  assert.deepEqual(vector(mesh, 'ambient'), [0, 0, 0]); assert.deepEqual(vector(mesh, 'specular'), [0, 0, 0]);
  assert.deepEqual(result.validation.readback.meshes[0].diffuse, vector(mesh, 'diffuse'));
  assert.deepEqual(result.validation.readback.meshes[0].selfIllumination, vector(mesh, 'selfillumcolor'));
  const packed = readHak(result.files.find(file => file.name === 'materialtest.hak')!.data);
  assert.deepEqual(packed.find(file => file.name === 'materialtest.mdl')!.data, mdl.data);
  assert.equal(result.validation.nativeVerified, false);
});

// Hand-written ASCII/controller tables. No writer is used to construct this
// fixture, including its asymmetric geometry and separate UV index order.
const independent = `newmodel materialfixture
setsupermodel materialfixture NULL
classification EFFECT
setanimationscale 1
beginmodelgeom materialfixture
node dummy materialfixture
 parent NULL
endnode
node dummy parent0
 parent materialfixture
 position 0 0 0
 orientation 0 0 1 0
 scale 1
endnode
node trimesh mesh0
 parent parent0
 position 0 0 0
 orientation 0 0 1 0
 scale 1
 bitmap NULL
 ambient 0 0 0
 diffuse 1 0.2 0.4
 selfillumcolor 0 0.4 0.6
 specular 0 0 0
 shininess 0
 alpha 0
 verts 3
 -0.8 0 -0.1
 0.8 0 0
 0.1 0 1
 endlist
 tverts 3
 0 0 0
 1 0 0
 0.4 1 0
 endlist
 faces 1
 0 1 2 0 2 0 1 0
 endlist
endnode
endmodelgeom materialfixture
newanim impact materialfixture
 length 2
 transtime 0
 animroot materialfixture
node dummy materialfixture
 parent NULL
endnode
node dummy parent0
 parent materialfixture
endnode
node trimesh mesh0
 parent parent0
 positionkey 2
 0 0 0 0
 2 0 0 0
 endlist
 orientationkey 2
 0 0 0 1 0
 2 0 0 1 0
 endlist
 scalekey 2
 0 1
 2 1
 endlist
 alphakey 3
 0 0
 1 1
 2 0
 endlist
endnode
doneanim impact materialfixture
donemodel materialfixture
`;
const independentLayer = (): MeshLayer => ({ ...makeMeshLayer('independent'), color: '#abcdef', duration: 2, alpha: 0,
  material: { diffuse: '#ff3366', selfIllumination: '#006699' },
  geometry: { kind: 'custom', vertices: [[-.8, 0, -.1], [.8, 0, 0], [.1, 0, 1]], faces: [[0, 1, 2]],
    uv: [[0, 0], [1, 0], [.4, 1]], uvFaces: [[2, 0, 1]] },
  animation: { alpha: [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 2, value: 0 }] } });

test('independent readback verifies both actual material fields with geometry and UV', () => {
  const parsed = readAsciiMdl(independent), layer = independentLayer();
  const result = readbackMesh(parsed, parsed.animations[0], layer, 'mesh0', 'parent0');
  assert.deepEqual(result.diffuse, [1, .2, .4]); assert.deepEqual(result.selfIllumination, [0, .4, .6]);
  assert.deepEqual(result.uvFaces, [[2, 0, 1]]); assert.deepEqual(result.vertices, layer.geometry.kind === 'custom' && layer.geometry.vertices);
  for (const text of [independent.replace('diffuse 1 0.2 0.4', 'diffuse 1 0.2 0.5'),
    independent.replace('selfillumcolor 0 0.4 0.6', 'selfillumcolor 0 0.4 0.5'),
    independent.replace('0 1 2 0 2 0 1 0', '0 1 2 1 2 0 1 0')]) {
    const changed = readAsciiMdl(text);
    assert.throws(() => readbackMesh(changed, changed.animations[0], layer, 'mesh0', 'parent0'), { code: 'EXPORT_VALIDATION_FAILED' });
  }
});
