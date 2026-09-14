import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MeshTriangleOrder} from '../packages/renderer/src/mesh-transparency.js';
import {createMeshPreviewGeometry,createMeshPreviewMaterial,updateMeshPreviewVertices} from '../packages/renderer/src/index.js';
import {transparencyFixture,permuteTriangles} from './fixtures/mesh-transparency.js';
import type {MeshLayer} from '../packages/core/src/model.js';
const camera=()=>{const c=new THREE.PerspectiveCamera(35,1,.1,100);c.position.set(0,-5,0);c.lookAt(0,0,0);c.updateMatrixWorld();return c;};
const drawData=(g:THREE.BufferGeometry)=>Array.from(g.index!.array).map(i=>Array.from(g.getAttribute('position').array.slice(i*3,i*3+3)));
test('normal-alpha ordering uses view depth, is permutation independent and retains attributes/UV/winding',()=>{
  const f=transparencyFixture(),original=JSON.stringify(f.document),results=[];
  for(const doc of [f.document,permuteTriangles(f.document,'reverse'),permuteTriangles(f.document,'shuffle')]){
    const l=doc.layers[0] as MeshLayer,g=createMeshPreviewGeometry(l),m=createMeshPreviewMaterial(l,null),mesh=new THREE.Mesh(g,m),sort=new MeshTriangleOrder(g);
    const attributes=JSON.stringify(Object.fromEntries(Object.entries(g.attributes).map(([n,a])=>[n,Array.from(a.array)])));
    sort.update(mesh,camera());const sorted=drawData(g);results.push(sorted);
    assert.equal(sorted[0][1],.5,'Far blue must precede near red');assert.equal(sorted.at(-1)![1],0);
    assert.equal(JSON.stringify(Object.fromEntries(Object.entries(g.attributes).map(([n,a])=>[n,Array.from(a.array)]))),attributes);
    sort.update(mesh,camera());assert.deepEqual(drawData(g),sorted);g.dispose();m.dispose();
  }
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[0],results[2]);assert.equal(JSON.stringify(f.document),original);
});
test('camera/parent transform and deformed vertices recompute depth; opaque/additive restore source draw order',()=>{
  const l=transparencyFixture().document.layers[0] as MeshLayer,g=createMeshPreviewGeometry(l),m=createMeshPreviewMaterial(l,null),mesh=new THREE.Mesh(g,m),sort=new MeshTriangleOrder(g),parent=new THREE.Group(),c=camera();parent.add(mesh);
  sort.update(mesh,c);assert.equal(drawData(g)[0][1],.5);
  parent.rotation.z=Math.PI;sort.update(mesh,c);assert.equal(drawData(g)[0][1],0);
  parent.rotation.z=0;c.position.set(0,5,0);c.lookAt(0,0,0);sort.update(mesh,c);assert.equal(drawData(g)[0][1],0);
  c.position.set(0,-5,0);c.lookAt(0,0,0);
  const vertices=(l.geometry as any).vertices.map((v:number[])=>[v[0],-v[1],v[2]]);updateMeshPreviewVertices(l,g,vertices);sort.update(mesh,c);assert.equal(Math.abs(drawData(g)[0][1]),0);
  updateMeshPreviewVertices(l,g,(l.geometry as any).vertices);sort.update(mesh,c);assert.equal(drawData(g)[0][1],.5);
  m.transparent=false;sort.update(mesh,c);assert.deepEqual(Array.from(g.index!.array),Array.from({length:12},(_,i)=>i));
  m.transparent=true;m.blending=THREE.AdditiveBlending;sort.update(mesh,c);assert.deepEqual(Array.from(g.index!.array),Array.from({length:12},(_,i)=>i));
  g.dispose();m.dispose();
});
test('equal-depth UV tie breaking is independent of input order without a frame-to-frame permutation',()=>{
  const f=transparencyFixture();for(const v of (f.document.layers[0] as any).geometry.vertices)v[1]=0;
  const keys=[];for(const d of [f.document,permuteTriangles(f.document,'reverse')]){
    const l=d.layers[0] as MeshLayer,g=createMeshPreviewGeometry(l),m=createMeshPreviewMaterial(l,null),mesh=new THREE.Mesh(g,m),sort=new MeshTriangleOrder(g);sort.update(mesh,camera());
    keys.push(Array.from(g.index!.array).map(i=>[g.getAttribute('position').getX(i),g.getAttribute('uv').getX(i)]));g.dispose();m.dispose();}
  assert.deepEqual(keys[0],keys[1]);
});
