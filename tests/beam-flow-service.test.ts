import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {createApp} from '../apps/service/src/app.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
import {flowFixture} from './fixtures/beam-flow.js';

test('finite flow enforces rights, pause, atomic locks, revision retry/undo, old clients, ZIP14 and checked job output',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-flow-service-')),app=await createApp({dataDir:dir});
  const call=(operation:string,input:object={},actor='owner',key=randomUUID(),schema=19)=>app.studio.dispatch(actor,{operation,input:input as any,idempotencyKey:key},schema);
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try{
    let p=ok(call('projects.import',{document:flowFixture()}));p=p.project??p;
    const actor=ok(call('actors.create',{name:'Flow test',projectIds:[p.id],scopes:['read','edit','export','build','jobs','artifacts']}));
    const foreign=ok(call('actors.create',{name:'Unshared',projectIds:[],scopes:['read','edit']}));
    const input=()=>({projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'flow',values:{beamBinding:{...p.document.layers[0].beamBinding,pulse:{period:.6,duty:.5}}}}]});
    const old=call('changes.apply',input(),actor.id,randomUUID(),18);assert.equal(old.error!.code,'CLIENT_UPGRADE_REQUIRED');assert.equal((old.error!.details as any).minimumStudioVersion,'0.27.0');
    assert.equal(call('changes.apply',input(),foreign.id).error!.code,'FORBIDDEN');
    ok(call('policy.set',{projectId:p.id,paused:true}));assert.equal(call('changes.apply',input(),actor.id).error!.code,'AI_PAUSED');ok(call('policy.set',{projectId:p.id,paused:false}));
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'flow',field:'beamBinding'}]}]}));assert.equal(call('changes.apply',input(),actor.id).error!.code,'LOCKED');
    p=ok(call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]}));
    const patch=input(),key=randomUUID(),r=call('changes.apply',patch,actor.id,key);p=ok(r);
    assert.equal(ok(call('changes.apply',patch,actor.id,key)).revision,p.revision);assert.equal(call('changes.apply',patch,actor.id).error!.code,'REVISION_CONFLICT');
    assert.equal(call('projects.inspect',{projectId:p.id},actor.id,randomUUID(),18).error!.code,'CLIENT_UPGRADE_REQUIRED');
    const zip=exportProjectBundle(p),manifest=JSON.parse(strFromU8(unzipSync(zip)['manifest.json']));assert.equal(manifest.schemaVersion,14);assert.equal(manifest.minimumStudioVersion,'0.27.0');assert.deepEqual(importProjectBundle(Buffer.from(zip).toString('base64')),p.document);
    for(const format of ['ascii','binary']){const q=ok(call('candidate.build',{projectId:p.id,revision:p.revision,modelName:'flow_service',profileId:`nwn-ee-beam-${format}-experimental-v1`},actor.id));await app.studio.drainJobs();const j=ok(call('jobs.get',{jobId:q.id},actor.id));assert.equal(j.status,'succeeded',JSON.stringify(j.error));assert.equal(j.metadata.validation.integration.effect.beam.finite.artifact,'beam-flow.json');}
    p=ok(call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:r.operationId},actor.id));assert.deepEqual(p.document.layers[0].beamBinding.pulse,{period:.5,duty:.6});
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
