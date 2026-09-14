import test from 'node:test';
import assert from 'node:assert/strict';
import {applyChanges,makeDocument,makeLayer,assertDocumentInvariants,changedFields,type EffectDocument,type EmitterLayer} from '../packages/core/src/model.js';
import {sampleBeamFlow,beamFlowEnvelope,birthAtQuantile} from '../packages/core/src/beam-flow.js';
import {validateDocument} from '../packages/contracts/src/schema.js';
import {verifyFiniteBeamSource} from '../packages/nwn-format/src/beam-flow-candidate.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {readHak} from '../packages/nwn-format/src/binary.js';
import {verifyBinaryBeam} from '../packages/nwn-format/src/binary-beam.js';
import {previewDuration} from '../packages/core/src/lifecycle.js';

import {flowFixture} from './fixtures/beam-flow.js';
test('finite binding is atomic, promotes only new documents and validates incompatible states',()=>{
  const d=flowFixture();assert.equal(d.schemaVersion,19);assert(validateDocument(d),JSON.stringify(validateDocument.errors));assertDocumentInvariants(d);
  assert.equal(validateDocument({...d,schemaVersion:18}),false);
  const l=d.layers[0] as EmitterLayer;
  const changed=applyChanges(d,[{type:'layer.set',layerId:'flow',values:{beamBinding:{...l.beamBinding!,pulse:{period:.6,duty:.4}}}}],false);
  assert.deepEqual(changedFields(d,changed).map(c=>c.path),['/layers/flow/beamBinding']);
  for(const values of [{speed:1},{position:[0,0,1] as [number,number,number]},{update:'Explosion' as const},{life:2}])assert.throws(()=>assertDocumentInvariants(applyChanges(d,[{type:'layer.set',layerId:'flow',values}],false)));
  assert.throws(()=>previewDuration(d,2));assert.equal(previewDuration(d),4);
  assert.throws(()=>assertDocumentInvariants(applyChanges(d,[{type:'layer.set',layerId:'flow',values:{beamBinding:null}}],false)));
  const restored=applyChanges(flowFixture(false),[{type:'project.set',values:{lifecycle:'impact'}},{type:'layer.set',layerId:'flow',values:{beamBinding:null}}],false);assert.equal(restored.schemaVersion,19);assert.equal((restored.layers[0] as EmitterLayer).beamBinding,undefined);
});
test('shared native gate and preview birth distribution preserve finite pulses and live closing tail',()=>{
  const d=flowFixture(false),l=d.layers[0] as EmitterLayer,rows=beamFlowEnvelope(l,d.duration).rows;
  const integral=rows.slice(1).reduce((s,r,i)=>s+(r[0]-rows[i][0])*(r[1]+rows[i][1])/2,0);assert(Math.abs(integral-l.count)<1e-9);
  const births=Array.from({length:1000},(_,i)=>birthAtQuantile(rows,(i+.5)/1000));
  assert(births.every(b=>b>=0&&b<3&&b% .5<=.300001));assert.equal(rows.at(-1)![1],0);
  const noPulse={...l,beamBinding:{...l.beamBinding!,pulse:undefined}},last=birthAtQuantile(beamFlowEnvelope(noPulse,d.duration).rows,.999);
  assert(last<3&&last+.6>3.59);assert(3.3-last<l.life);assert(3.6-last>=l.life);
  const b=l.beamBinding!;assert.deepEqual(sampleBeamFlow(b,0,l.life),b.source);assert.deepEqual(sampleBeamFlow(b,l.life,l.life),b.target);
  assert.deepEqual(sampleBeamFlow({...b,direction:'target-to-source'},0,l.life),b.target);
  assert.deepEqual(sampleBeamFlow(b,.3,.6,[1,0,2],[1,4,2]),[1,2,2]);
  assert(Math.abs(sampleBeamFlow(b,.15,.6)[1]-.46875)<1e-10);
});
test('ASCII exports real cast01 P2P gate and separately bounded endpoint resource closure',()=>{
  const d=flowFixture(),before=JSON.stringify(d),r=buildCandidate(d,'flow_test');assert.equal(JSON.stringify(d),before);
  const flow=JSON.parse(new TextDecoder().decode(r.files.find(f=>f.name==='beam-flow.json')!.data));
  const mdl=r.files.find(f=>f.name==='flow_test.mdl')!.data;assert.throws(()=>verifyFiniteBeamSource(new TextEncoder().encode(new TextDecoder().decode(mdl).replace('p2p 1','p2p 0')),d));
  assert.equal(flow.layers.length,1);assert.equal(flow.endpoints.length,2);assert.equal(flow.pool,'one-instance-through-feed-and-drain');
  assert.equal(r.validation.integration.effect!.schemaVersion,6);assert.equal(r.validation.exporterVersion,'nwn-ascii-vfx-0.27.0');
  const resources=readHak(r.files.find(f=>f.name==='flow_test.hak')!.data);assert.equal(resources.filter(f=>f.name.endsWith('.mdl')).length,3);
  for(const e of flow.endpoints){assert(resources.some(f=>f.name===e.model.file));assert.equal(e.integration.progfx2da.columns.Type,12);assert.equal(e.integration.progfx2da.columns.Param1,e.node);}
});
test('binary reads P2P flags, reference, finite controllers and every endpoint model',async t=>{
  if(!binaryCompilerAvailable())return t.skip('Pinned Windows compiler unavailable');
  const d=flowFixture(),r=await buildCompiledCandidate(d,'flow_test');
  const flow=JSON.parse(new TextDecoder().decode(r.files.find(f=>f.name==='beam-flow.json')!.data));
  assert.equal(flow.compiledEndpointModels.length,2);assert.equal(flow.binaryReadback.nodes.find((n:any)=>n.type==='emitter').flags,3);
  assert.equal(r.validation.compilation!.sourceProfileId,d.profileId);assert.equal(r.validation.nativeVerified,false);
  for(const f of readHak(r.files.find(f=>f.name==='flow_test.hak')!.data).filter(f=>f.name.endsWith('.mdl')))assert.equal(new DataView(f.data.buffer,f.data.byteOffset).getUint32(0,true),0);
  const source=r.files.find(f=>f.name==='source-model.mdl.txt')!.data,binary=r.files.find(f=>f.name==='flow_test.mdl')!.data;
  assert.throws(()=>verifyBinaryBeam(source,binary.subarray(0,binary.length-1)));
});
