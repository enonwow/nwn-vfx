import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../apps/service/src/app.js';
import {freezeComposition,verifyComposition} from '../apps/service/src/composition.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {assertCompositionBudget,type CompositionInput} from '../packages/core/src/composition.js';
import {validateOperationInput,validateOperationOutput} from '../packages/contracts/src/schema.js';
import {makeDocument,makeLayer} from '../packages/core/src/model.js';
import {flipbookFixture} from './fixtures/flipbook.js';

const input=(a='a',b='b'):CompositionInput=>({duration:2,time:1,instances:[{id:'left',projectId:a,revision:1,start:0,position:[-1,0,0],yawRadians:0},{id:'right',projectId:b,revision:1,start:.5,position:[1,0,0],yawRadians:Math.PI}]});
const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
test('composition validates timing/transforms, exact hashes and aggregate allocations',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'composition-bounds-')),app=await createApp({dataDir:dir});
  const call=(operation:string,value:any)=>ok(app.studio.dispatch('owner',{operation,input:value,idempotencyKey:randomUUID()}));
  try{
    call('projects.import',{projectId:'a',document:flipbookFixture()});call('projects.import',{projectId:'b',document:flipbookFixture()});
    const good=input();validateOperationInput('preview.compose',good);const snapshot=freezeComposition(app.studio,good),before=canonical(snapshot);
    assert.equal(assertCompositionBudget(snapshot).layers,2);assert.equal(canonical(snapshot),before);
    for(const bad of [{...good,time:3},{...good,instances:[]},{...good,instances:[good.instances[0],good.instances[0]]},...[-1,2,NaN].map(start=>({...good,instances:[{...good.instances[0],start}]})),...[0,11,Infinity].map(scale=>({...good,instances:[{...good.instances[0],scale}]})),{...good,instances:[{...good.instances[0],yawRadians:Infinity}]},{...good,instances:[{...good.instances[0],position:[0,51,0]}]},{...good,instances:[{...good.instances[0],revision:0}]},{...good,unknown:true}])assert.throws(()=>validateOperationInput('preview.compose',bad));
    assert.throws(()=>freezeComposition(app.studio,{...good,instances:[{...good.instances[0],snapshotSha256:'0'.repeat(64)}]}),{code:'SNAPSHOT_MISMATCH'});
    snapshot.sources[0].document.name='corrupt';assert.throws(()=>verifyComposition(snapshot),{code:'SNAPSHOT_MISMATCH'});
    const doc=makeDocument('empty');doc.layers=Array.from({length:32},(_,i)=>({...makeLayer('l'+i),count:250}));
    call('projects.import',{projectId:'heavy',document:doc});assert.throws(()=>freezeComposition(app.studio,{duration:2,instances:Array.from({length:5},(_,i)=>({...good.instances[0],id:'i'+i,projectId:'heavy'}))}),{code:'LIMIT_EXCEEDED'});
    doc.layers=doc.layers.map(l=>({...l,count:1}));call('projects.import',{projectId:'layers',document:doc});
    assert.throws(()=>freezeComposition(app.studio,{duration:2,instances:Array.from({length:9},(_,i)=>({...good.instances[0],id:'i'+i,projectId:'layers'}))}),{code:'LIMIT_EXCEEDED'});
    assert.equal(app.studio.project('a').revision,1);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});

test('all-source access, immutable revisions, old-client fence, idempotency and protected artifact reads',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'composition-access-'));let rendered:any;
  const app=await createApp({dataDir:dir,render:async(_doc,options)=>{rendered=structuredClone(options.composition);return {files:[{name:'preview.png',data:new Uint8Array([1,2,3])}]};}});
  const call=async(operation:string,value:any={},token=app.studio.config.ownerToken,key=randomUUID(),compatible=true)=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:'Bearer '+token,'x-nwn-vfx-document-schema':'12',...(compatible?{'x-nwn-vfx-composition-preview':'1'}:{})},payload:{operation,input:value,idempotencyKey:key}})).json();
  try{
    for(const id of ['a','b'])ok(await call('projects.import',{projectId:id,document:flipbookFixture()}));
    const original=app.studio.project('b'),actor=ok(await call('actors.create',{name:'compose',projectIds:['a','b'],scopes:['read','render','jobs','artifacts','cancel']})),limited=ok(await call('actors.create',{name:'partial',projectIds:['a'],scopes:actor.scopes}));
    const request=input(),key=randomUUID();
    assert.equal((await call('preview.compose',request,limited.token)).error.code,'FORBIDDEN');
    assert.equal((await call('preview.compose',request,actor.token,key,false)).error.code,'CLIENT_UPGRADE_REQUIRED');
    ok(await call('policy.set',{projectId:'b',paused:true}));assert.equal((await call('preview.compose',request,actor.token,key)).error.code,'AI_PAUSED');ok(await call('policy.set',{projectId:'b',paused:false}));
    const accepted=await call('preview.compose',request,actor.token,key),job=ok(accepted);assert.equal(ok(await call('preview.compose',request,actor.token,key)).id,job.id);
    assert.equal((await call('preview.compose',{...request,time:.8},actor.token,key)).error.code,'IDEMPOTENCY_CONFLICT');
    ok(await call('changes.apply',{projectId:'b',expectedRevision:1,changes:[{type:'project.set',values:{name:'new head'}}]}));
    await app.studio.drainJobs();const done=ok(await call('jobs.get',{jobId:job.id},actor.token));assert.equal(done.status,'succeeded',JSON.stringify(done.error));validateOperationOutput('jobs.get',done);
    assert.deepEqual(rendered.sources.find((s:any)=>s.projectId==='b').document,original.document);assert.equal(rendered.sources[1].snapshotSha256,hash(canonical(original.document)));
    const cancelled=await call('jobs.cancel',{jobId:job.id},actor.token);ok(cancelled);assert.equal((await call('operations.get',{operationId:cancelled.operationId},limited.token)).error.code,'FORBIDDEN');
    const artifact=done.artifacts[0];assert.equal((await call('jobs.get',{jobId:job.id},actor.token,randomUUID(),false)).error.code,'CLIENT_UPGRADE_REQUIRED');
    for(const [operation,payload] of [['jobs.get',{jobId:job.id}],['jobs.cancel',{jobId:job.id}],['artifacts.get',{artifactId:artifact.id}],['operations.get',{operationId:accepted.operationId}]] as const)assert.equal((await call(operation,payload,limited.token)).error.code,'FORBIDDEN');
    for(const op of ['jobs.list','artifacts.list'])assert.equal(ok(await call(op,{projectId:'a'},limited.token)).items.length,0);
    assert(!ok(await call('events.list',{projectId:'a'},limited.token)).items.some((e:any)=>e.jobId===job.id));
    const denied=await app.inject({url:artifact.downloadUrl,headers:{host:'127.0.0.1:4317',authorization:'Bearer '+limited.token}});assert.equal(denied.statusCode,403);
    const bytes=(await app.inject({url:artifact.downloadUrl,headers:{host:'127.0.0.1:4317',authorization:'Bearer '+actor.token}})).rawPayload;assert.equal(hash(bytes),artifact.sha256);
    ok(await call('actors.revoke',{actorId:actor.id}));assert.equal((await call('operations.resolve',{operation:'preview.compose',idempotencyKey:key},actor.token)).error.code,'UNAUTHORIZED');
    assert.deepEqual(app.studio.project('b',1),original);assert.equal(app.studio.project('a').revision,1);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});

test('secondary source pause at publication blocks artifacts and resume rechecks every source',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'composition-publication-'));let pause=true,app:Awaited<ReturnType<typeof createApp>>;
  app=await createApp({dataDir:dir,render:async()=>{if(pause)ok(app.studio.dispatch('owner',{operation:'policy.set',input:{projectId:'b',paused:true},idempotencyKey:randomUUID()}));return {files:[{name:'preview.png',data:new Uint8Array([1])}]};}});
  const call=(operation:string,value:any={},actor='owner')=>app.studio.dispatch(actor,{operation,input:value,idempotencyKey:randomUUID()});
  try{
    for(const id of ['a','b'])ok(call('projects.import',{projectId:id,document:flipbookFixture()}));
    const agent=ok(call('actors.create',{name:'compose',projectIds:['a','b'],scopes:['read','render','jobs','artifacts']}));
    const job=ok(call('preview.compose',input(),agent.id));await app.studio.drainJobs();let done=ok(call('jobs.get',{jobId:job.id}));assert.equal(done.status,'blocked');assert.equal(done.error.code,'AI_PAUSED');assert.equal(done.artifacts.length,0);
    pause=false;ok(call('policy.set',{projectId:'b',paused:false}));await app.studio.drainJobs();done=ok(call('jobs.get',{jobId:job.id}));assert.equal(done.status,'succeeded');
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
