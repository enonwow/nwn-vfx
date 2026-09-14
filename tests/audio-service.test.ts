import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../apps/service/src/app.js';
import {audioFixture} from './fixtures/audio.js';

test('audio operations preserve visual fields, idempotency, grants, locks, pause, conflicts, selective undo and restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'studio-audio-test-'));let app=await createApp({dataDir:dir});
  const call=async(operation:string,input:object,token=app.studio.config.ownerToken,key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:'Bearer '+token},payload:{operation,input,idempotencyKey:key}})).json();
  const ok=(r:any)=>{assert.equal(r.status,'ok',JSON.stringify(r.error));return r.data;};
  try{
    const f=audioFixture();let p=ok(await call('projects.create',{preset:'empty'}));const visuals=structuredClone(p.document.layers);
    const actor=ok(await call('actors.create',{name:'Audio author',projectIds:[p.id],scopes:['read','edit','create','export']}));
    const input={projectId:p.id,expectedRevision:1,fileName:f.asset.name,dataBase64:f.asset.dataBase64},key=randomUUID(),imported=await call('audio.import',input,actor.token,key);p=ok(imported).project;
    assert.deepEqual(ok(await call('audio.import',input,actor.token,key)),imported.data);assert.equal(p.document.schemaVersion,9);assert.deepEqual(p.document.layers,visuals);
    assert.equal(ok(await call('audio.list',{projectId:p.id},actor.token)).items[0].dataBase64,undefined);
    assert.equal(ok(await call('audio.get',{projectId:p.id,assetId:f.asset.id},actor.token)).dataBase64,f.asset.dataBase64);
    assert.equal((await call('audio.get',{projectId:p.id,revision:1,assetId:f.asset.id},actor.token)).error.code,'MISSING_ASSET');
    const added=await call('changes.apply',{projectId:p.id,expectedRevision:2,changes:[{type:'audio.add',clip:f.clip}]},actor.token);p=ok(added);
    assert.equal((await call('changes.apply',{projectId:p.id,expectedRevision:2,changes:[{type:'audio.set',clipId:'bite',values:{gain:.5}}]},actor.token)).error.code,'REVISION_CONFLICT');
    assert.equal((await call('audio.remove',{projectId:p.id,expectedRevision:p.revision,assetIds:[f.asset.id]},actor.token)).error.code,'ASSET_IN_USE');
    p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[{layerId:'bite',field:'start'}]}]}));
    assert.equal((await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'audio.set',clipId:'bite',values:{start:0}}]},actor.token)).error.code,'LOCKED');
    ok(await call('policy.set',{projectId:p.id,paused:true}));assert.equal((await call('audio.import',{...input,expectedRevision:p.revision},actor.token)).error.code,'AI_PAUSED');
    ok(await call('policy.set',{projectId:p.id,paused:false}));p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'locks.set',locks:[]}]}));
    const boosted={projectId:p.id,expectedRevision:p.revision,changes:[{type:'audio.set',clipId:'bite',values:{gain:3}}]};
    const proposal=await call('changes.preview',boosted,actor.token);assert.equal(ok(proposal).document.audioClips[0].gain,3);assert.equal(proposal.diagnostics[0].audio.peak,12000/32768);assert.equal(proposal.diagnostics[0].audio.clippedSamples,0);
    assert.equal(ok(await call('projects.inspect',{projectId:p.id})).revision,p.revision);
    assert.equal((await call('changes.apply',{...boosted,changes:[{type:'audio.set',clipId:'bite',values:{gain:16}}]},actor.token)).status,'failed');
    const edit=await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'audio.set',clipId:'bite',values:{gain:3,fadeIn:.03}}]},actor.token);p=ok(edit);assert.equal(p.document.audioClips[0].gain,3);assert.equal(edit.diagnostics[0].audio.limiter,false);
    p=ok(await call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'audio.add',clip:{...f.clip,id:'second',start:1.4}}]},actor.token));
    p=ok(await call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:edit.operationId},actor.token));assert.equal(p.document.audioClips[0].gain,1);assert.equal(p.document.audioClips.length,2);
    const other=ok(await call('projects.create',{preset:'empty'}));assert.equal((await call('audio.get',{projectId:other.id,assetId:f.asset.id},actor.token)).error.code,'FORBIDDEN');
    await app.close();app=await createApp({dataDir:dir});assert.deepEqual(ok(await call('projects.inspect',{projectId:p.id})).document,p.document);
    assert.deepEqual(p.document.layers,visuals);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));rmSync(dir,{recursive:true,force:true});}
});

test('schema-10 capability negotiation refuses old clients before a write and dB changes undo without source changes',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'studio-db-version-')),app=await createApp({dataDir:dir});
  const call=async(operation:string,input:object,modern=true,key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:'Bearer '+app.studio.config.ownerToken,...(modern?{'x-nwn-vfx-document-schema':'10'}:{})},payload:{operation,input,idempotencyKey:key}})).json();
  try{
    const f=audioFixture();let p=(await call('projects.import',{document:f.document})).data;
    assert.equal((await call('projects.inspect',{projectId:p.id},false)).status,'ok');
    assert.equal((await call('capabilities',{},false)).status,'ok');assert.equal((await call('schema.get',{operation:'changes.apply'},false)).status,'ok');
    const input={projectId:p.id,expectedRevision:1,changes:[{type:'audio.set',clipId:'bite',values:{gainDb:24}}]},key=randomUUID();
    const denied=await call('changes.apply',input,false,key);assert.equal(denied.error.code,'CLIENT_UPGRADE_REQUIRED');
    assert.match(denied.error.message,/0.18.0/);assert.equal((await call('projects.inspect',{projectId:p.id})).data.revision,1);
    const applied=await call('changes.apply',input,true,key);assert.equal(applied.status,'ok');p=applied.data;assert.equal(p.document.schemaVersion,10);
    assert.deepEqual((await call('changes.apply',input,true,key)).data,p);
    assert.equal((await call('changes.apply',input,false,key)).error.code,'CLIENT_UPGRADE_REQUIRED');
    for(const operation of ['projects.inspect','projects.list'])assert.equal((await call(operation,operation.endsWith('inspect')?{projectId:p.id}:{},false)).error.code,'CLIENT_UPGRADE_REQUIRED');
    assert.equal((await call('changes.apply',{projectId:p.id,expectedRevision:2,changes:[{type:'audio.set',clipId:'bite',values:{gain:1}}]},false)).error.code,'CLIENT_UPGRADE_REQUIRED');
    const undo=await call('changes.revert',{projectId:p.id,expectedRevision:2,operationId:applied.operationId});assert.equal(undo.status,'ok');
    assert.equal(undo.data.document.audioClips[0].gain,1);assert.equal(undo.data.document.schemaVersion,10);
    assert.deepEqual(undo.data.document.audioAssets,f.document.audioAssets);
    const historical=(await call('projects.inspect',{projectId:p.id,revision:1},false)).data;assert.deepEqual(historical.document,f.document);
  }finally{await app.close();assert.equal(resolve(dir,'..'),resolve(tmpdir()));rmSync(dir,{recursive:true,force:true});}
});
