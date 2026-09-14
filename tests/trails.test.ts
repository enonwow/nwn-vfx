import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument,makeTrailLayer,applyChanges,changedFields,type EffectDocument} from '../packages/core/src/model.js';
import {assertDocument} from '../packages/contracts/src/schema.js';
import {compileTrailParts,interpolateFrames,trailOpacity,pointAt,trailCost,validateTrail} from '../packages/core/src/trails.js';
import {buildCandidate,readAsciiMdl,readHak} from '../packages/nwn-format/src/index.js';

const document=():EffectDocument=>{const doc={...makeDocument('empty'),schemaVersion:6 as const,duration:2,layers:[makeTrailLayer('trail','Custom trail',2)]};assertDocument(doc);return doc;};
test('trail preserves source schema promotion, atomic fields and human locks',()=>{
  const source=makeDocument('empty'),trail=makeTrailLayer('light_path');
  const added=applyChanges(source,[{type:'layer.add',layer:trail}],true);assert.equal(added.schemaVersion,6);assertDocument(added);
  assert.throws(()=>assertDocument({...added,schemaVersion:5}));
  const changed=applyChanges(added,[{type:'layer.set',layerId:trail.id,values:{head:{enabled:false,size:.04}}}],true);
  assert.equal(changedFields(added,changed).filter(d=>d.path.endsWith('/head')).length,1);
  const locked={...added,locks:[{layerId:trail.id,field:'path'}]};
  assert.throws(()=>applyChanges(locked,[{type:'layer.set',layerId:trail.id,values:{path:trail.path}}],false),{code:'LOCKED'});
  assert.throws(()=>applyChanges(added,[{type:'layer.set',layerId:'sparks',values:{path:trail.path}}],true),{code:'VALIDATION_ERROR'});
  assert.throws(()=>applyChanges(added,[{type:'layer.set',layerId:trail.id,values:{texture:'glow'}}],true),{code:'VALIDATION_ERROR'});
});
test('trail enforces ordered path, tail interval, segment budget and total sample budget',()=>{
  const doc=document(),trail=doc.layers[0];assert.equal(trail.type,'trail');if(trail.type!=='trail')return;
  for(const changed of [{path:[trail.path[0],trail.path[0]]},{tailLifetime:3},{path:[]},{maxSegmentLength:0}])assert.throws(()=>assertDocument({...doc,layers:[{...trail,...changed}]}));
  assert.throws(()=>validateTrail({...trail,maxSegmentLength:.005},2),{code:'LIMIT_EXCEEDED'});
  assert.throws(()=>assertDocument({...doc,duration:30,layers:Array.from({length:20},(_,i)=>({...trail,id:`t${i}`}))}),{code:'LIMIT_EXCEEDED'});
  const six={...doc,duration:4,layers:Array.from({length:6},(_,i)=>({...trail,id:`t${i}`}))};assertDocument(six);assert(trailCost(six).vertexSamples<1_000_000);
  assert.throws(()=>assertDocument({...doc,layers:[{...trail,path:[{time:0,position:[0,0,0]},{time:.001,position:[0,0,1]}]}]}),{code:'VALIDATION_ERROR'});
});
test('an explicitly authored path reversal produces finite crossed geometry',()=>{
  const trail={...makeTrailLayer('reverse','reverse',2),maxSegmentLength:1,path:[{time:0,position:[0,0,0] as [number,number,number]},{time:.5,position:[0,0,1] as [number,number,number]},{time:1,position:[0,0,0] as [number,number,number]}]};
  validateTrail(trail,2);
  for(const part of compileTrailParts(trail,2))for(const frame of part.frames)assert(frame.vertices.every(v=>v.every(Number.isFinite)));
});
test('trail samples grow behind the shared moving head; tail narrows, head fades, last frame empty',()=>{
  const trail={...makeTrailLayer('t','t',2),start:.113,duration:2};const parts=compileTrailParts(trail,2.2),body=parts[0],head=parts[1];
  assert.equal(parts.length,2);assert.equal(trailOpacity(head,0),0);assert.equal(trailOpacity(head,2.2),0);
  for(let tick=0;tick<=528;tick++) {
    const t=tick/240,frame=interpolateFrames(body,t),h=interpolateFrames(head,t),center=h.vertices.reduce<number[]>((s,v)=>s.map((x,k)=>x+v[k]),[0,0,0]).map(v=>v/h.vertices.length);
    for(let i=0;i<frame.vertices.length;i+=4) {
      const a=frame.vertices[i],b=frame.vertices[i+1],width=Math.hypot(...a.map((v,k)=>v-b[k]));
      if(width>1e-6){assert(t>=trail.start);assert((a[2]+b[2])/2<=center[2]+1e-9);}
      if(t===0||t===2.2)assert(width<1e-9);
    }
  }
  const firstWidth=(t:number)=>{const f=interpolateFrames(body,t).vertices;return Math.hypot(...f[0].map((v,i)=>v-f[1][i]));};
  assert(firstWidth(.3)>firstWidth(.6));assert.equal(firstWidth(1),0);
  assert.notDeepEqual(pointAt(trail.path,.2),pointAt(trail.path,.8));
});
test('candidate serializes and reads every animmesh vertex/UV, head alpha and exact HAK bytes',()=>{
  const doc=document(),candidate=buildCandidate(doc,'trail_unit');
  const mdl=candidate.files.find(f=>f.name==='trail_unit.mdl')!,parsed=readAsciiMdl(mdl.data);
  assert.equal(parsed.nodes.filter(n=>n.type==='animmesh').length,2);
  assert.equal(candidate.validation.readback.trails?.length,2);assert(candidate.validation.readback.trails!.every(r=>r.allSamplesRead&&r.vertexSamples>0&&r.animvertsSha256.length===64));
  const head=candidate.validation.readback.trails!.find(r=>r.kind==='head')!;assert.equal(head.alphaKeys[0][1],0);assert.equal(head.alphaKeys.at(-1)![1],0);
  const unpacked=readHak(candidate.files.find(f=>f.name==='trail_unit.hak')!.data);assert.deepEqual(unpacked.find(f=>f.name==='trail_unit.mdl')!.data,mdl.data);
  assert.equal(candidate.validation.nativeVerified,false);
  assert(candidate.validation.diagnostics.some(d=>d.code==='TRAIL_COMPILED_COST'));
});
