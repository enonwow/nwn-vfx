import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import * as THREE from 'three';
import {unzipSync,strFromU8} from 'fflate';
import {beamMotionFixture} from './fixtures/beam-motion.js';
import {buildBeamMotionAtlas,beamMotionFrame,beamMotionTiming} from '../packages/core/src/beam-motion.js';
import {applyChanges,assertDocumentInvariants,makeDocument,type BeamLayer} from '../packages/core/src/model.js';
import {validateChanges,validateDocument} from '../packages/contracts/src/schema.js';
import {createBeamPreview,updateBeamPreview} from '../packages/renderer/src/beam.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {createApp} from '../apps/service/src/app.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
import {assertCompositionBudget,type CompositionSnapshot} from '../packages/core/src/composition.js';

// Native V increases along the segment; source pixels are rows top-first.
const pixel=(rgba:Uint8Array,frame:number,u:number,w=.5)=>{const x=frame%4*256+Math.round(w*255),y=Math.floor(frame/4)*256+255-Math.round(u*255);return [...rgba.slice((y*1024+x)*4,(y*1024+x)*4+4)];};
test('composition charges generated beam atlas memory, shares repeated textures and refuses excessive unique atlases',()=>{
  const {document}=beamMotionFixture(),snapshot:CompositionSnapshot={compositionVersion:1,input:{duration:1,instances:Array.from({length:24},(_,i)=>({id:'i'+i,projectId:'p',revision:1,start:0,position:[0,0,0],yawRadians:0}))},sources:[{projectId:'p',revision:1,snapshotSha256:'a'.repeat(64),document}]};
  assert.equal(assertCompositionBudget(snapshot).textureBytes,1024*1024*4+16*16*4);
  snapshot.sources=Array.from({length:17},(_,i)=>{const d=structuredClone(document);(d.layers[0] as BeamLayer).nativeMotion!.fps=i+1;return {projectId:'p'+i,revision:1,snapshotSha256:'b'.repeat(64),document:d};});
  snapshot.input.instances=snapshot.sources.map((s,i)=>({id:'i'+i,projectId:s.projectId,revision:1,start:0,position:[0,0,0],yawRadians:0}));
  assert.throws(()=>assertCompositionBudget(snapshot),/budżet/);
});
test('beam atlas preserves source, removes only alpha padding and moves actual bright pixels in opposite directions',()=>{
  const {document,layer,asset}=beamMotionFixture(),original=JSON.stringify(asset),a=buildBeamMotionAtlas(document,layer);
  assert.deepEqual(a.metadata.crop,{x:0,y:6,width:16,height:4});assert.equal(JSON.stringify(asset),original);
  const rgba=a.pixels.rgba;
  // At frame4 target->source peak is at .75; frame8 at .5, frame12 at .25.
  for(const [f,u] of [[4,.75],[8,.5],[12,.25]]){assert(pixel(rgba,f,u)[3]>250);assert(pixel(rgba,f,1-u===u?.1:1-u)[3]<70);}
  const forward=buildBeamMotionAtlas(document,{...layer,nativeMotion:{...layer.nativeMotion!,direction:'source-to-target'}});
  assert(pixel(forward.pixels.rgba,4,.25)[3]>250);assert(pixel(forward.pixels.rgba,4,.75)[3]<70);
  assert(pixel(rgba,0,0)[0]>240,'source X0 remains red at native V0');assert(pixel(rgba,0,1)[2]>240,'target X1 remains blue at native V1');
  const fitted=buildBeamMotionAtlas(document,{...layer,nativeMotion:{...layer.nativeMotion!,phase:'closing'}});
  const padded=buildBeamMotionAtlas(document,{...layer,nativeMotion:{...layer.nativeMotion!,phase:'closing',fit:'source'}});
  assert.equal(pixel(fitted.pixels.rgba,0,.5,.05)[3],255);assert.equal(pixel(padded.pixels.rgba,0,.5,.05)[3],0);
  assert.deepEqual(buildBeamMotionAtlas(document,layer).pixels, a.pixels,'deterministic pixels');
});
test('opening reveals source first; closing erases target first; first/last masks and native looping are explicit',()=>{
  for(const phase of ['opening','closing'] as const){const {document,layer}=beamMotionFixture(phase),{pixels}=buildBeamMotionAtlas(document,layer);
    for(const u of [0,.25,.5,.75,1]){assert.equal(pixel(pixels.rgba,0,u)[3],phase==='opening'?0:255);assert.equal(pixel(pixels.rgba,15,u)[3],phase==='opening'?255:0);}
    assert.equal(pixel(pixels.rgba,7,.1)[3],255);assert.equal(pixel(pixels.rgba,7,.9)[3],0);
    assert.deepEqual(beamMotionTiming(layer.nativeMotion!).transitionWindowSeconds,[.9375,1]);
    assert.equal(beamMotionFrame(layer.nativeMotion!,.9375),15);assert.equal(beamMotionFrame(layer.nativeMotion!,1),0);
  }
});
test('motion preview uses one metric quad and the actual native V atlas rectangle at each frame',()=>{
  const {layer}=beamMotionFixture(),mesh=createBeamPreview(layer,new THREE.Texture()),camera=new THREE.PerspectiveCamera();camera.position.set(5,-4,3);
  assert.equal(mesh.geometry.getAttribute('position').count,4);assert.equal(mesh.geometry.index!.count,6);assert.equal(mesh.material.uniforms.moving.value,0);
  for(const [time,expected] of [[0,[0,.75,.25,.75,0,1,.25,1]],[.3125,[.25,.5,.5,.5,.25,.75,.5,.75]]] as const){updateBeamPreview(mesh,layer,time,camera);assert.deepEqual([...mesh.geometry.getAttribute('uv').array],expected);}
  for(const distance of [.1,3,30]){const l={...layer,source:[0,-distance/2,0] as [number,number,number],target:[0,distance/2,0] as [number,number,number]};updateBeamPreview(mesh,l,0,camera);const p=mesh.geometry.getAttribute('position');assert(Math.abs(new THREE.Vector3().fromBufferAttribute(p,0).distanceTo(new THREE.Vector3().fromBufferAttribute(p,1))-l.width)<1e-6);}
  mesh.geometry.dispose();mesh.material.dispose();
});
test('closed motion schemas reject malformed fields; domain rejects bent/multi-segment and downgrade; reset is explicit',()=>{
  const {document,layer,motion}=beamMotionFixture();assert(validateDocument(document),JSON.stringify(validateDocument.errors));assertDocumentInvariants(document);
  for(const bad of [{...motion,fps:0},{...motion,fps:1.2},{...motion,pulseWidth:0},{...motion,direction:'victim'},{...motion,fit:'magic'},{...motion,extra:true},{phase:'flow'}])assert.equal(validateChanges([{type:'layer.set',layerId:'beam',values:{nativeMotion:bad}}]),false);
  for(const values of [{segments:16},{radius:.1},{lightningScale:.1}])assert.throws(()=>assertDocumentInvariants(applyChanges(document,[{type:'layer.set',layerId:'beam',values}],false)),/prostego/);
  const old={...document,schemaVersion:16 as const};assert.equal(validateDocument(old),false);assert.throws(()=>assertDocumentInvariants(old),/dokumentu 17/);
  const reset=applyChanges(document,[{type:'layer.set',layerId:'beam',values:{nativeMotion:null}}],false);assert.equal(Object.hasOwn(reset.layers[0],'nativeMotion'),false);assert.equal(reset.schemaVersion,17);
  assert.throws(()=>applyChanges(makeDocument(),[{type:'layer.set',layerId:'sparks',values:{nativeMotion:motion}}],false),/wymaga beam/);
  const locked=applyChanges(document,[{type:'locks.set',locks:[{layerId:layer.id,field:'nativeMotion'}]}],true);assert.throws(()=>applyChanges(locked,[{type:'layer.set',layerId:layer.id,values:{nativeMotion:null}}],false),/blokad/);
});
test('all whole-beam motion phases fail closed for ASCII and binary export while source and preview remain usable',async()=>{
  for(const phase of ['flow','opening','closing'] as const){
    const {document}=beamMotionFixture(phase),before=JSON.stringify(document);
    const blocked=(e:any)=>e.code==='BEAM_MOTION_EXPORT_BLOCKED';
    assert.throws(()=>buildCandidate(document,'motion_blocked'),blocked);
    if(binaryCompilerAvailable())await assert.rejects(buildCompiledCandidate(document,'motion_blocked'),blocked);
    assert.equal(JSON.stringify(document),before);
    assert(buildBeamMotionAtlas(document,document.layers[0] as BeamLayer).pixels.rgba.length>0);
    const reset=applyChanges(document,[{type:'layer.set',layerId:'beam',values:{nativeMotion:null}}],false);
    const safe=buildCandidate(reset,'static_reset');assert.equal(safe.validation.checks.beamPointCountsSafe,true);
    assert.equal(safe.validation.exporterVersion,'nwn-ascii-vfx-0.26.1');
  }
});

test('motion operations preserve grants, pause, locks, retry, revisions, atomic undo and ZIP12; old schema16 writes roll back',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-motion-')),app=await createApp({dataDir:dir});
  const call=(op:string,input:object={},actor='owner',key=randomUUID(),schema=17)=>app.studio.dispatch(actor,{operation:op,input:input as any,idempotencyKey:key},schema),ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try{
    let p=ok(call('projects.create',{projectId:'own-motion',preset:'empty',lifecycle:'beam'}));
    const actor=ok(call('actors.create',{name:'Motion agent',projectIds:[p.id],scopes:['read','edit','export','build','jobs','artifacts']}));
    const changes=[{type:'layer.set',layerId:'beam',values:{segments:2,radius:0,lightningScale:0,nativeMotion:beamMotionFixture().motion}}];
    const input=()=>({projectId:p.id,expectedRevision:p.revision,changes});
    assert.equal(call('changes.apply',input(),actor.id,randomUUID(),16).error!.code,'CLIENT_UPGRADE_REQUIRED');assert.equal(ok(call('projects.inspect',{projectId:p.id})).revision,1);
    ok(call('policy.set',{projectId:p.id,paused:true}));assert.equal(call('changes.apply',input(),actor.id).error!.code,'AI_PAUSED');ok(call('policy.set',{projectId:p.id,paused:false}));
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'beam',field:'nativeMotion'}]}]}));assert.equal(p.document.schemaVersion,17);assert.equal(call('changes.apply',input(),actor.id).error!.code,'LOCKED');
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]}));
    const key=randomUUID(),patch=input(),r=call('changes.apply',patch,actor.id,key);p=ok(r);assert.equal(ok(call('changes.apply',patch,actor.id,key)).revision,p.revision);assert.equal(call('changes.apply',patch,actor.id).error!.code,'REVISION_CONFLICT');
    const bundle=exportProjectBundle(p),manifest=JSON.parse(strFromU8(unzipSync(bundle)['manifest.json']));assert.equal(manifest.schemaVersion,12);assert.equal(manifest.minimumStudioVersion,'0.26.0');assert.deepEqual(importProjectBundle(Buffer.from(bundle).toString('base64')),p.document);
    const job=ok(call('candidate.build',{projectId:p.id,revision:p.revision,modelName:'motion_service',profileId:'nwn-ee-beam-ascii-experimental-v1'},actor.id));await app.studio.drainJobs();const failed=ok(call('jobs.get',{jobId:job.id},actor.id));assert.equal(failed.status,'failed');assert.equal(failed.error.code,'BEAM_MOTION_EXPORT_BLOCKED');assert.equal(failed.artifacts.length,0);
    p=ok(call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:r.operationId},actor.id));assert.equal(p.document.layers[0].nativeMotion,undefined);assert.equal(p.document.layers[0].segments,16);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
