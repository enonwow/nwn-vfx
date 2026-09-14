import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeMeshLayer, type MeshLayer } from '../packages/core/src/model.js';
import { createMeshPreviewGeometry, createMeshPreviewMaterial, updateMeshPreviewOpacity } from '../packages/renderer/src/index.js';

const lit = (): MeshLayer => ({ ...makeMeshLayer('stone'), material: { diffuse: '#808080', selfIllumination: '#102030' } });
function map(alpha: number) { return new THREE.DataTexture(new Uint8Array([255, 0, 0, 255, 0, 255, 0, alpha]), 2, 1); }

test('omitted mesh material retains legacy unlit color, blending and depth policy at every opacity', () => {
  const layer = makeMeshLayer('legacy'), material = createMeshPreviewMaterial(layer, null);
  assert.ok(material instanceof THREE.MeshBasicMaterial);
  assert.equal(material.color.getHexString(), 'd4b474');
  for (const alpha of [1, .25, 0, 1]) {
    updateMeshPreviewOpacity(layer, material, alpha);
    assert.equal(material.opacity, alpha); assert.equal(material.transparent, true); assert.equal(material.depthWrite, false);
  }
  material.dispose();
});

test('explicit diffuse/emissive colors and the bitmap are independent of legacy layer color', () => {
  const layer = lit(), texture = map(255), material = createMeshPreviewMaterial(layer, texture);
  assert.ok(material instanceof THREE.MeshLambertMaterial);
  assert.equal(material.color.getHexString(), '808080'); assert.equal(material.emissive.getHexString(), '102030');
  assert.equal(material.emissiveIntensity, 1); assert.equal(material.flatShading, true);
  assert.equal(material.map, texture); assert.equal(material.emissiveMap, texture);
  assert.equal(material.transparent, false); assert.equal(material.depthWrite, true);
  material.dispose(); texture.dispose();
});

test('animated opacity switches lit meshes between opaque depth writing and transparent blending on every sample', () => {
  const layer = lit(), material = createMeshPreviewMaterial(layer, null);
  for (const alpha of [1, .5, 0, .25, 1]) {
    updateMeshPreviewOpacity(layer, material, alpha);
    assert.equal(material.opacity, alpha);
    assert.equal(material.transparent, alpha < 1); assert.equal(material.depthWrite, alpha === 1);
  }
  material.dispose();
});

test('a single nonopaque texture pixel and additive blend each prohibit depth writes even at alpha one', () => {
  for (const [texture, blend] of [[map(254), 'normal'], [map(255), 'additive']] as const) {
    const layer = { ...lit(), blend }, material = createMeshPreviewMaterial(layer, texture);
    for (const alpha of [.3, 1, 0, 1]) {
      updateMeshPreviewOpacity(layer, material, alpha);
      assert.equal(material.transparent, true); assert.equal(material.depthWrite, false);
    }
    material.dispose(); texture.dispose();
  }
});

test('lit custom triangles without UV have independent flat normals preserving their winding', () => {
  const layer: MeshLayer = { ...lit(), geometry: { kind: 'custom',
    vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], faces: [[0, 1, 2], [0, 3, 1]] } };
  const geometry = createMeshPreviewGeometry(layer), normals = geometry.getAttribute('normal');
  assert.equal(geometry.index, null); assert.equal(normals.count, 6);
  for (let i = 0; i < 3; i++) assert.deepEqual([normals.getX(i), normals.getY(i), normals.getZ(i)], [0, 0, 1]);
  for (let i = 3; i < 6; i++) assert.deepEqual([normals.getX(i), normals.getY(i), normals.getZ(i)], [0, 1, 0]);
  geometry.dispose();
});
