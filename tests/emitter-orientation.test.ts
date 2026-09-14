import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { applyChanges, changedFields, makeDocument, makeLayer, makeMeshLayer, promoteDocumentSchema, type AxisAngle, type EffectDocument, type EmitterLayer } from '../packages/core/src/model.js';
import { prepareEmitterOrientation, sampleEmitterPosition } from '../packages/core/src/simulation.js';
import { assertDocument, operationSchemas, validateOperationInput, validateOperationOutput } from '../packages/contracts/src/schema.js';

const xAxis:AxisAngle=[0,1,0,Math.PI/2], yAxis:AxisAngle=[1,0,0,-Math.PI/2];
function close(actual:number[],expected:number[],epsilon=1e-12) {
  actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<=epsilon,`${actual} != ${expected}`));
}
function legacy(layer:EmitterLayer,age:number,azimuth:number,theta:number,speed:number) {
  const x=Math.cos(azimuth)*Math.sin(theta)*speed*age;
  const y=Math.sin(azimuth)*Math.sin(theta)*speed*age;
  const z=Math.cos(theta)*speed*age-.5*layer.gravity*age*age;
  return [layer.position[0]+x*layer.scale,layer.position[1]+y*layer.scale,layer.position[2]+z*layer.scale];
}

test('omitted and explicit neutral orientations preserve every historical ballistic float',()=>{
  for(const scale of [.01,.7,1,3.75,10])for(const gravity of [-4,0,7.2]) {
    const layer={...makeLayer('particle'),position:[-.3,.8,2] as [number,number,number],scale,gravity};
    for(const age of [0,.13,1.71,9])for(const azimuth of [0,.8,5.1])for(const theta of [0,.71,Math.PI]) {
      const expected=legacy(layer,age,azimuth,theta,2.3);
      assert.deepEqual(sampleEmitterPosition(layer,age,azimuth,theta,2.3),expected);
      assert.deepEqual(sampleEmitterPosition({...layer,orientation:[0,0,1,0]},age,azimuth,theta,2.3),expected);
    }
    assert.equal(prepareEmitterOrientation(layer),null);
  }
});

test('axis-angle presets rotate the local +Z launch axis into X+, Y+ and retain Z+',()=>{
  const base={...makeLayer('particle'),position:[0,0,0] as [number,number,number],gravity:0,scale:1};
  close(sampleEmitterPosition({...base,orientation:xAxis},2,0,0,3),[6,0,0]);
  close(sampleEmitterPosition({...base,orientation:yAxis},2,0,0,3),[0,6,0]);
  close(sampleEmitterPosition({...base,orientation:[0,0,1,0]},2,0,0,3),[0,0,6]);
  // Rotating around Z also rotates an off-axis launch vector: the whole cone turns.
  close(sampleEmitterPosition({...base,orientation:[0,0,1,Math.PI/2]},1,0,Math.PI/2,2),[0,2,0]);
});

test('general right-handed rotation leaves gravity in world Z and retains existing scale semantics',()=>{
  const unit=1/Math.sqrt(3),orientation:AxisAngle=[unit,unit,unit,2*Math.PI/3];
  const base={...makeLayer('particle'),position:[2,3,5] as [number,number,number],orientation,gravity:0,scale:2};
  const prepared=prepareEmitterOrientation(base);
  close(sampleEmitterPosition(base,1,0,0,2,prepared),[6,3,5]);
  close(sampleEmitterPosition(base,1,0,Math.PI/2,2,prepared),[2,7,5]);
  for(const azimuth of [0,.65,2.8])for(const theta of [0,.6,1.5]) {
    const free=sampleEmitterPosition(base,.75,azimuth,theta,3,prepared);
    const falling=sampleEmitterPosition({...base,gravity:4},.75,azimuth,theta,3,prepared);
    close(falling,[free[0],free[1],free[2]-.5*4*.75*.75*2]);
    assert.deepEqual(sampleEmitterPosition(base,.75,azimuth,theta,3,prepared),sampleEmitterPosition(base,.75,azimuth,theta,3));
  }
});

test('orientation promotes only explicit emitter use to schema 4 and never demotes later documents',()=>{
  for(const schemaVersion of [1,2,3] as const) {
    const original:EffectDocument={...makeDocument('empty'),schemaVersion},snapshot=structuredClone(original);
    assertDocument(original);assert.deepEqual(promoteDocumentSchema(structuredClone(original)),original);
    const oriented=applyChanges(original,[{type:'layer.set',layerId:'sparks',values:{orientation:xAxis}}],true);
    assert.equal(oriented.schemaVersion,4);assertDocument(oriented);assert.deepEqual(original,snapshot);
    assert.throws(()=>assertDocument({...oriented,schemaVersion}));
    const reset=applyChanges(oriented,[{type:'layer.set',layerId:'sparks',values:{orientation:null}}],true);
    assert.equal(reset.schemaVersion,4);assert.equal(Object.hasOwn(reset.layers[0],'orientation'),false);assertDocument(reset);
    reset.assets=[];assert.equal(promoteDocumentSchema(reset).schemaVersion,4);
  }
  const mesh=applyChanges(makeDocument('empty'),[{type:'layer.add',layer:makeMeshLayer('mesh')}],true);
  assert.equal(mesh.schemaVersion,2);
  assert.throws(()=>applyChanges(mesh,[{type:'layer.set',layerId:'mesh',values:{orientation:null}}],true),/wymaga orientacji/);
});

test('layer.set/add enforce finite unit axis and angle bounds; discovery publishes the same nullable edit contract',()=>{
  const input=(orientation:unknown)=>({projectId:'project',expectedRevision:1,changes:[{type:'layer.set',layerId:'sparks',values:{orientation}}]});
  const published=new Ajv({strict:false}).compile(operationSchemas['changes.apply'].inputSchema);
  for(const value of [xAxis,yAxis,[0,0,1,0],null]) {assert.equal(published(input(value)),true);validateOperationInput('changes.apply',input(value));}
  for(const value of [[],[0,1,0],[0,1,0,0,0],['0',1,0,0],[0,1,0,Math.PI*9]]) {
    assert.equal(published(input(value)),false);assert.throws(()=>validateOperationInput('changes.apply',input(value)));
  }
  for(const orientation of [[0,0,0,0],[0,0,2,1],[NaN,0,1,1],[0,0,1,Infinity],[0,0,1,Math.PI*8+.01]]) {
    assert.throws(()=>assertDocument({...makeDocument('empty'),schemaVersion:4,layers:[{...makeLayer('sparks'),orientation}]}));
  }
  const added={...makeLayer('horizontal'),orientation:xAxis};
  validateOperationInput('changes.apply',{projectId:'project',expectedRevision:1,changes:[{type:'layer.add',layer:added}]});
  const document=applyChanges(makeDocument('empty'),[{type:'layer.add',layer:added}],true);assertDocument(document);assert.equal(document.schemaVersion,4);
  const date='2026-09-06T12:00:00.000Z';
  validateOperationOutput('projects.inspect',{id:'project',revision:2,document,createdAt:date,updatedAt:date});
  assert.throws(()=>assertDocument({...document,layers:[{...added,orientation:null}]}));
});

test('orientation is an atomic diff field and obeys existing locks including reset',()=>{
  const document=makeDocument('empty');
  const changed=applyChanges(document,[{type:'layer.set',layerId:'sparks',values:{orientation:xAxis}}],true);
  assert.deepEqual(changedFields(document,changed),[{path:'/schemaVersion',before:1,after:4},{path:'/layers/sparks/orientation',before:null,after:xAxis}]);
  changed.locks=[{layerId:'sparks',field:'orientation'}];assertDocument(changed);
  for(const orientation of [yAxis,null])assert.throws(()=>applyChanges(changed,[{type:'layer.set',layerId:'sparks',values:{orientation}}],false),/blokad/);
  const independent=applyChanges(changed,[{type:'layer.set',layerId:'sparks',values:{alpha:.5}}],false);
  assert.deepEqual(independent.layers[0].orientation,xAxis);
});
