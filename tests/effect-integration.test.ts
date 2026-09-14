import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {createApp} from '../apps/service/src/app.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {exportProjectBundle,importProjectBundle} from '../apps/service/src/project-bundle.js';
import {applyChanges,makeDocument,EFFECT_INTEGRATION_CAPABILITIES} from '../packages/core/src/model.js';
import {assertDocument,validateOperationInput,validateOperationOutput} from '../packages/contracts/src/schema.js';
import {buildCandidate,readHak} from '../packages/nwn-format/src/index.js';
import {buildCompiledCandidate,binaryCompilerAvailable} from '../packages/nwn-format/src/compiled-candidate.js';
import {bindEffectIntegration} from '../packages/nwn-format/src/effect-integration.js';
import {audioFixture} from './fixtures/audio.js';

const patch=(orientWithObject:unknown)=>[{type:'project.set',values:{orientWithObject}}];
const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
test('whole-effect boolean is optional, strict, revision-promoted, and portable without historical rewrites',()=>{
  const legacy=audioFixture(true).document,original=structuredClone(legacy);
  assert(!Object.hasOwn(legacy,'orientWithObject'));assertDocument(legacy);
  for(const value of [0,1,'true','false',null,{},[]]){
    assert.throws(()=>validateOperationInput('changes.apply',{projectId:'fixture',expectedRevision:1,changes:patch(value)}));
    assert.throws(()=>applyChanges(legacy,patch(value) as any,true));
    assert.throws(()=>assertDocument({...legacy,schemaVersion:11,orientWithObject:value}));
  }
  for(const value of [true,false]){
    const doc=applyChanges(legacy,patch(value) as any,true);assertDocument(doc);
    assert.equal(doc.schemaVersion,11);assert.equal(doc.orientWithObject,value);
    assert.deepEqual(doc.layers,legacy.layers);assert.deepEqual(doc.audioAssets,legacy.audioAssets);assert.deepEqual(doc.audioClips,legacy.audioClips);
    const zip=exportProjectBundle({id:'fixture',revision:2,createdAt:'',updatedAt:'',document:doc});
    const files=unzipSync(zip),manifest=JSON.parse(strFromU8(files['manifest.json']));assert.equal(manifest.schemaVersion,6);assert.equal(manifest.minimumStudioVersion,'0.19.0');
    assert.deepEqual(importProjectBundle(Buffer.from(zip).toString('base64')),doc);
    assert.throws(()=>assertDocument({...doc,schemaVersion:10}));
  }
  const zip=exportProjectBundle({id:'fixture',revision:1,createdAt:'',updatedAt:'',document:legacy});
  assert.equal(JSON.parse(strFromU8(unzipSync(zip)['manifest.json'])).schemaVersion,4);
  assert.deepEqual(importProjectBundle(Buffer.from(zip).toString('base64')),legacy);assert.deepEqual(legacy,original);
});

test('0/1 instruction binds actual final model; ASCII source, texture and WAV resources stay identical',async()=>{
  const doc=audioFixture(true).document,source=structuredClone(doc);
  for(const binary of [false,...(binaryCompilerAvailable()?[true]:[])]){
    const builds=[];
    for(const value of [undefined,false,true]){
      const document=value===undefined?doc:applyChanges(doc,patch(value) as any,true);
      const result=binary?await buildCompiledCandidate(document,'orient_fixture'):buildCandidate(document,'orient_fixture');
      bindEffectIntegration(result,document,{projectId:'fixture',revision:3});
      const effect=result.validation.integration.effect!;
      const artifact=result.files.find(f=>f.name==='vfx-integration.json')!;
      assert.deepEqual(JSON.parse(Buffer.from(artifact.data).toString()),effect);
      assert.deepEqual(effect.visualeffects2da,{rowId:null,columns:{OrientWithObject:value?1:0}});
      assert.equal(effect.orientWithObject,value??false);assert.equal(effect.projectId,'fixture');assert.equal(effect.revision,3);
      assert.equal(effect.snapshotSha256,hash(canonical(document)));
      assert.equal(effect.documentSha256,result.validation.documentSha256);
      assert.equal(effect.model.sha256,hash(result.files.find(f=>f.name===effect.model.file)!.data));
      assert.equal(effect.nativeVerified,false);assert.equal(result.validation.integration.visualeffects2daIncluded,false);
      assert(!readHak(result.files.find(f=>f.name==='orient_fixture.hak')!.data).some(f=>f.name.endsWith('.2da')||f.name==='vfx-integration.json'));
      assert.deepEqual(JSON.parse(Buffer.from(result.files.find(f=>f.name==='validation.json')!.data).toString()),result.validation);
      // Binary event-name trailing bytes vary between independent compiles.
      // The separate mixed-model binary proof checks full decompiled output and
      // every direct mesh/draw/sample/normal field, not just these source hashes.
      builds.push(result.files.filter(f=>/\.(mdl|tga|txi|wav)$/.test(f.name)&&(!binary||!f.name.endsWith('.mdl'))||binary&&f.name==='source-model.mdl.txt').map(f=>({name:f.name,sha256:hash(f.data)})));
    }
    assert.deepEqual(builds[1],builds[0]);assert.deepEqual(builds[2],builds[0]);
  }
  assert.deepEqual(doc,source);
});

test('shared service enforces locks, old clients, pause, idempotency, conflicts, history/undo and job handoff',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'studio-effect-integration-'));let app=await createApp({dataDir:dir});
  const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,schema='11',key=randomUUID())=>
    (await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:'Bearer '+token,'x-nwn-vfx-document-schema':schema},payload:{operation,input,idempotencyKey:key}})).json();
  try{
    let p=ok(await call('projects.create',{preset:'empty'}));const original=structuredClone(p.document),id=p.id;
    const actor=ok(await call('actors.create',{name:'Integration tester',projectIds:[id],scopes:['read','edit','build','artifacts','jobs']}));
    const input=(value:unknown,rev=p.revision)=>({projectId:id,expectedRevision:rev,changes:patch(value)});
    for(const schema of ['','10']){
      assert.equal((await call('changes.apply',input(true),actor.token,schema)).error.code,'CLIENT_UPGRADE_REQUIRED');
      assert.equal((await call('projects.inspect',{projectId:id},actor.token,schema)).status,'ok');
      assert.deepEqual(ok(await call('capabilities',{},undefined,schema)).effectIntegration,EFFECT_INTEGRATION_CAPABILITIES);
    }
    const preview=ok(await call('changes.preview',input(true),actor.token));assert.equal(preview.document.orientWithObject,true);
    assert.equal(ok(await call('projects.inspect',{projectId:id})).revision,1);
    const payload=input(true),key=randomUUID(),applied=await call('changes.apply',payload,actor.token,'11',key);p=ok(applied);
    assert.deepEqual(ok(await call('changes.apply',payload,actor.token,'11',key)),p);
    assert.equal((await call('changes.apply',input(false,1),actor.token)).error.code,'REVISION_CONFLICT');
    assert.equal((await call('projects.inspect',{projectId:id},actor.token,'10')).error.code,'CLIENT_UPGRADE_REQUIRED');
    const history=ok(await call('revisions.list',{projectId:id})).items.find((r:any)=>r.revision===2);assert.equal(history.actorId,actor.id);assert(history.committedAt);
    p=ok(await call('changes.apply',{projectId:id,expectedRevision:2,changes:[{type:'project.set',values:{name:'Independent rename'}}]}));
    p=ok(await call('changes.revert',{projectId:id,expectedRevision:3,operationId:applied.operationId},actor.token));
    assert(!Object.hasOwn(p.document,'orientWithObject'));assert.equal(p.document.name,'Independent rename');assert.equal(p.document.schemaVersion,11);
    assert.deepEqual(p.document.layers,original.layers);
    p=ok(await call('changes.apply',{projectId:id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'@effect',field:'orientWithObject'}]}]}));
    assert.equal((await call('changes.apply',input(true),actor.token)).error.code,'LOCKED');
    assert.equal((await call('changes.apply',{projectId:id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]},actor.token)).error.code,'FORBIDDEN');
    p=ok(await call('changes.apply',{projectId:id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]}));
    ok(await call('policy.set',{projectId:id,paused:true}));assert.equal((await call('changes.apply',input(true),actor.token)).error.code,'AI_PAUSED');ok(await call('policy.set',{projectId:id,paused:false}));
    const set=await call('changes.apply',input(true),actor.token);p=ok(set);
    p=ok(await call('changes.apply',input(false),actor.token));
    assert.equal((await call('changes.revert',{projectId:id,expectedRevision:p.revision,operationId:set.operationId},actor.token)).error.code,'UNDO_CONFLICT');
    await app.close();app=await createApp({dataDir:dir});assert.deepEqual(ok(await call('projects.inspect',{projectId:id})).document,p.document);
    const jobId=ok(await call('candidate.build',{projectId:id,revision:p.revision,modelName:'orient_fixture'},actor.token)).id;
    await app.studio.drainJobs();const job=ok(await call('jobs.get',{jobId},actor.token));assert.equal(job.status,'succeeded',JSON.stringify(job.error));validateOperationOutput('jobs.get',job);
    const download=async(name:string)=>{
      const a=job.artifacts.find((a:any)=>a.name===name);const r=await app.inject({url:a.downloadUrl,headers:{host:'127.0.0.1:4317',authorization:'Bearer '+actor.token}});
      assert.equal(r.statusCode,200);assert.equal(hash(r.rawPayload),a.sha256);return JSON.parse(r.rawPayload.toString());
    };
    const effect=await download('vfx-integration.json'),handoff=await download('handoff.json');
    assert.equal(effect.revision,p.revision);assert.equal(effect.projectId,id);assert.equal(effect.snapshotSha256,handoff.snapshotSha256);
    assert.deepEqual(effect,handoff.metadata.validation.integration.effect);assert.deepEqual(effect,(await download('validation.json')).integration.effect);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
