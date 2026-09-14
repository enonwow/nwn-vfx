import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChanges, changedFields, makeDocument, makeMeshLayer, type EffectDocument, type MeshLayer } from '../packages/core/src/model.js';
import { axisAngleToQuaternion, buildMeshGeometry, sampleMeshLayer } from '../packages/core/src/mesh.js';
import { assertDocument } from '../packages/contracts/src/schema.js';

function fixture(): EffectDocument { return {...makeDocument('empty'),schemaVersion:2,layers:[makeMeshLayer('mesh')]}; }
test('legacy emitter documents retain schema 1; adding geometry promotes a new immutable document to schema 2',()=>{
  const old=makeDocument(),original=structuredClone(old); assertDocument(old);
  const updated=applyChanges(old,[{type:'layer.add',layer:makeMeshLayer('mesh')}],true);
  assert.equal(updated.schemaVersion,2);assertDocument(updated);assert.deepEqual(old,original);
  assert.throws(()=>assertDocument({...updated,schemaVersion:1}),/Niepoprawny dokument/);
  assert.throws(()=>assertDocument({...updated,layers:[{...makeMeshLayer('mesh'),texture:'spark'}]}),/Niepoprawny dokument/);
});
test('mesh schemas reject malformed indices, degenerate geometry, invalid axes, duplicate or out-of-range keys',()=>{
  for (const bad of [
    {geometry:{kind:'custom',vertices:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,3]]}},
    {geometry:{kind:'custom',vertices:[[0,0,0],[1,0,0],[2,0,0]],faces:[[0,1,2]]}},
    {geometry:{kind:'ring',innerRadius:1,outerRadius:.5,segments:16}},
    {orientation:[0,0,2,1]},
    {animation:{alpha:[{time:1,value:1},{time:1,value:0}]}},
    {animation:{scale:[{time:4,value:1}]}},
    {animation:{alpha:[{time:0,value:1.1}]}},
    {start:1,duration:3},
  ]) assert.throws(()=>assertDocument({...fixture(),layers:[{...makeMeshLayer('mesh'),...bad}]}));
  assertDocument({...fixture(),layers:[makeMeshLayer('ring','Ring','ring'),makeMeshLayer('custom','Custom','custom')]});
});
test('geometry generators produce wound nondegenerate meshes and preserve custom data without mutation',()=>{
  const box=buildMeshGeometry({kind:'box',dimensions:[2,4,6]});assert.equal(box.vertices.length,8);assert.equal(box.faces.length,12);
  assert.deepEqual(box.vertices[0],[-1,-2,-3]);
  const ring=buildMeshGeometry({kind:'ring',innerRadius:1,outerRadius:2,segments:16});assert.equal(ring.vertices.length,32);assert.equal(ring.faces.length,32);
  const disk=buildMeshGeometry({kind:'ring',innerRadius:0,outerRadius:2,segments:16});assert.equal(disk.vertices.length,17);assert.equal(disk.faces.length,16);
  const custom=makeMeshLayer('custom','Custom','custom').geometry; const clone=structuredClone(custom);
  buildMeshGeometry(custom).vertices[0][0]=19;assert.deepEqual(custom,clone);
});
test('mesh scrubbing is deterministic with local time, interpolation, held endpoints and shortest path rotation',()=>{
  const mesh:MeshLayer={...makeMeshLayer('mesh'),start:.5,duration:2,position:[0,0,2],alpha:0,
    animation:{position:[{time:0,value:[0,0,2]},{time:1,value:[0,0,0]}],alpha:[{time:0,value:0},{time:.5,value:1},{time:2,value:0}],
      scale:[{time:1,value:2}],orientation:[{time:0,value:[0,0,1,170*Math.PI/180]},{time:1,value:[0,0,1,-170*Math.PI/180]}]}};
  const middle=sampleMeshLayer(mesh,1);assert.deepEqual(middle.position,[0,0,1]);assert.equal(middle.scale,1.5);assert.equal(middle.alpha,1);
  const q=axisAngleToQuaternion(middle.orientation);assert.ok(Math.abs(q[3])<1e-8,'shortest arc passes 180 degrees, not zero');
  assert.equal(sampleMeshLayer(mesh,.49).visible,false);assert.equal(sampleMeshLayer(mesh,2.51).visible,false);
  assert.deepEqual(sampleMeshLayer(mesh,2).position,[0,0,0]);
  for(const t of [2,.6,1.8,.9]) sampleMeshLayer(mesh,t);
  assert.deepEqual(sampleMeshLayer(mesh,1),middle);
});
test('geometry and animation are atomic diff fields and obey human field locks',()=>{
  const old=fixture();old.locks=[{layerId:'mesh',field:'animation'}];
  assert.throws(()=>applyChanges(old,[{type:'layer.set',layerId:'mesh',values:{animation:{alpha:[{time:1,value:0}]}}}],false),/blokad/);
  const next=applyChanges(old,[{type:'layer.set',layerId:'mesh',values:{geometry:{kind:'ring',innerRadius:.2,outerRadius:1,segments:16}}}],false);
  assert.deepEqual(changedFields(old,next).map(d=>d.path),['/layers/mesh/geometry']);
});
