import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import * as THREE from 'three';
import {createBeamPreview,updateBeamPreview} from '../packages/renderer/src/beam.js';
import {createApp} from '../apps/service/src/app.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
import {makeDocument,applyChanges,assertDocumentInvariants,type BeamLayer} from '../packages/core/src/model.js';
import {sampleBeam} from '../packages/core/src/beam.js';
import {validateDocument,validateChanges,operationSchemas} from '../packages/contracts/src/schema.js';
import {buildCandidate,readAsciiMdl} from '../packages/nwn-format/src/index.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {verifyBinaryBeam} from '../packages/nwn-format/src/binary-beam.js';

test('beam has exact endpoints and width at varying distances; source preview intent is separate from static export',()=>{
  const d=makeDocument('empty','Technical beam','beam'),l=d.layers[0] as BeamLayer;
  assert.equal(validateDocument(d),true,JSON.stringify(validateDocument.errors));assertDocumentInvariants(d);
  for(const distance of [.1,1,3,12,30]){
    const beam={...l,source:[0,0,0] as [number,number,number],target:[distance/Math.sqrt(3),distance/Math.sqrt(3),distance/Math.sqrt(3)] as [number,number,number]};
    const mesh=createBeamPreview(beam,new THREE.Texture()),camera=new THREE.PerspectiveCamera();camera.position.set(5,-8,6);
    for(const time of [0,.15,1,8]){const sample=sampleBeam(beam,time);assert(Math.abs(sample.length-distance)<1e-12);assert.deepEqual(sample.points[0],beam.source);assert.deepEqual(sample.points.at(-1),beam.target);
      updateBeamPreview(mesh,beam,time,camera);const p=mesh.geometry.getAttribute('position');
      for(let i=0;i<=beam.segments;i++){const a=new THREE.Vector3().fromBufferAttribute(p,2*i),b=new THREE.Vector3().fromBufferAttribute(p,2*i+1);assert(Math.abs(a.distanceTo(b)-l.width)<2e-6,'actual vertex width');}
    }mesh.geometry.dispose();mesh.material.dispose();
  }
  const before=buildCandidate(d,'custom_beam'),other=applyChanges(d,[{type:'layer.set',layerId:l.id,values:{target:[2,4,2],flow:{direction:'source-to-target',speed:4}}}],false);
  const after=buildCandidate(other,'custom_beam');assert.deepEqual(before.files.find(f=>f.name==='custom_beam.mdl')!.data,after.files.find(f=>f.name==='custom_beam.mdl')!.data);
  assert.equal(sampleBeam(l,1).flowOffset,-1.2);assert.equal(sampleBeam(other.layers[0] as BeamLayer,1).flowOffset,4);
  assert.throws(()=>assertDocumentInvariants(applyChanges(d,[{type:'layer.set',layerId:l.id,values:{target:l.source}}],false)),/Odległość/);
  assert.throws(()=>applyChanges(d,[{type:'layer.set',layerId:l.id,values:{duration:8}}],false),/parametrem beam/);
});

test('beam source contracts, locks, promotion and ASCII reference readback remain explicit',()=>{
  const d=makeDocument('empty','Technical beam','beam');const l=d.layers[0] as BeamLayer;
  const changes=[{type:'layer.set',layerId:l.id,values:{width:.06,radius:.03}}];assert.equal(validateChanges(changes),true);
  const locked=applyChanges(d,[{type:'locks.set',locks:[{layerId:l.id,field:'width'}]}],true);
  assert.throws(()=>applyChanges(locked,changes as any,false),/blokad/);
  const result=buildCandidate(d,'beam_readback'),mdl=readAsciiMdl(result.files.find(f=>f.name==='beam_readback.mdl')!.data);
  assert.equal(mdl.animations.length,0);assert.equal(mdl.nodes.filter(n=>n.type==='reference').length,1);
  const integration=result.validation.integration.effect!;assert.equal(integration.visualeffects2da.columns.Type_FD,'B');assert.equal(integration.beam!.progfx2da.columns.Param1,'beam_readback');assert.equal(integration.beam!.progfx2da.columns.Type,7);assert.equal(integration.beam!.nativeFlowControl,false);
  // Candidate metadata validation is also exercised by the service test; the
  // isolated source file has no allocated row or runtime authority.
  assert.equal(integration.visualeffects2da.rowId,null);assert.equal(integration.beam!.progfx2da.rowId,null);assert.equal(result.validation.nativeVerified,false);
});

test('binary beam reads Lightning controllers and reference bytes independently; corruption is rejected',{skip:!binaryCompilerAvailable()},async()=>{
  const d=makeDocument('empty','Technical beam','beam'),result=await buildCompiledCandidate(d,'beam_binary');
  const source=result.files.find(f=>f.name==='source-model.mdl.txt')!.data,binary=result.files.find(f=>f.name==='beam_binary.mdl')!.data;
  const read=verifyBinaryBeam(source,binary);assert.equal(read.allReferencesRead,true);assert.equal(read.nodes.length,2);
  const damaged=new Uint8Array(binary),needle=new TextEncoder().encode('fx_ref'),offset=Buffer.from(damaged).indexOf(needle);assert(offset>0);damaged[offset]=120;
  assert.throws(()=>verifyBinaryBeam(source,damaged),/reference target/);
  assert.equal(result.validation.nativeVerified,false);
});

test('beam service enforces old-client rollback, grant, pause, locks, retry, undo, ZIP and published job contracts',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-beam-')),app=await createApp({dataDir:dir});
  const call=(operation:string,input:Record<string,unknown>={},actor='owner',key=randomUUID(),schema=16)=>app.studio.dispatch(actor,{operation,input,idempotencyKey:key},schema);
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try{
    assert.equal(call('projects.create',{projectId:'old-beam',preset:'empty',lifecycle:'beam'},'owner',randomUUID(),15).error!.code,'CLIENT_UPGRADE_REQUIRED');
    assert.equal(call('projects.inspect',{projectId:'old-beam'}).error!.code,'NOT_FOUND');
    let p=ok(call('projects.create',{projectId:'own-beam',preset:'empty',lifecycle:'beam'}));
    const actor=ok(call('actors.create',{name:'Beam agent',projectIds:[p.id],scopes:['read','edit','export','render','build','artifacts','jobs']}));
    const input=()=>({projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'beam',values:{width:.08,flow:{direction:'source-to-target',speed:2}}}]});
    ok(call('policy.set',{projectId:p.id,paused:true}));assert.equal(call('changes.apply',input(),actor.id).error!.code,'AI_PAUSED');ok(call('policy.set',{projectId:p.id,paused:false}));
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'beam',field:'flow'}]}]}));
    assert.equal(call('changes.apply',input(),actor.id).error!.code,'LOCKED');
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]}));
    const key=randomUUID(),change=input(),applied=call('changes.apply',change,actor.id,key);p=ok(applied);
    assert.equal(ok(call('changes.apply',change,actor.id,key)).revision,p.revision);assert.equal(call('changes.apply',change,actor.id).error!.code,'REVISION_CONFLICT');
    p=ok(call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:applied.operationId},actor.id));assert.equal(p.document.layers[0].width,.045);assert.equal(p.document.layers[0].flow.direction,'target-to-source');
    const zip=exportProjectBundle(p);assert.deepEqual(importProjectBundle(Buffer.from(zip).toString('base64')),p.document);
    assert.equal(call('projects.inspect',{projectId:p.id},actor.id,randomUUID(),15).error!.code,'CLIENT_UPGRADE_REQUIRED');
    const foreign=ok(call('actors.create',{name:'Foreign beam agent',projectIds:[],scopes:['read','edit']}));assert.equal(call('changes.apply',input(),foreign.id).error!.code,'FORBIDDEN');
    for(const profileId of ['nwn-ee-beam-ascii-experimental-v1','nwn-ee-beam-binary-experimental-v1']){
      if(profileId.includes('binary')&&!binaryCompilerAvailable())continue;
      let job=ok(call('candidate.build',{projectId:p.id,revision:p.revision,profileId,modelName:'beam_service'},actor.id));
      for(let i=0;i<100&&['queued','running'].includes(job.status);i++){await new Promise(r=>setTimeout(r,20));job=ok(call('jobs.get',{jobId:job.id},actor.id));}
      assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert(job.artifacts.some((a:any)=>a.fileName==='beam.json'));assert.equal(job.metadata.validation.integration.effect.schemaVersion,6);
    }
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
