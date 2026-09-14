import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { createApp } from '../apps/service/src/app.js';
import { makeMeshLayer } from '../packages/core/src/model.js';
import { rgbaPng } from './fixtures/rgba-texture.js';

const ok=(result:any):any=>{assert.equal(result.status,'ok',JSON.stringify(result.error));return result.data;};
const rejected=(result:any,code:string)=>{assert.equal(result.status,'failed');assert.equal(result.error.code,code,JSON.stringify(result.error));};
const image=(index:number)=>Buffer.from(rgbaPng(8,8,(x,y)=>[index*17,x*13,y*19,255]));
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');

async function fixture() {
  const dataDir=mkdtempSync(join(tmpdir(),'nwn-vfx-assets-remove-'));let app=await createApp({dataDir});
  const call=async(operation:string,input:object,options:{token?:string;key?:string}={})=>(await app.inject({method:'POST',url:'/api/commands',
    headers:{host:'127.0.0.1:4317',authorization:`Bearer ${options.token??app.studio.config.ownerToken}`},
    payload:{operation,input,idempotencyKey:options.key??randomUUID()}})).json();
  const inspect=async(projectId:string)=>ok(await call('projects.inspect',{projectId}));
  const add=async(project:any,index:number)=>ok(await call('assets.import',{projectId:project.id,expectedRevision:project.revision,
    fileName:`texture-${index}.png`,pngBase64:image(index).toString('base64')}));
  const remove=(project:any,assetIds:string[],options?:{token?:string;key?:string})=>call('assets.remove',{projectId:project.id,expectedRevision:project.revision,assetIds},options);
  const archive=async(projectId:string,revision:number)=>{
    const exported=ok(await call('projects.export',{projectId,revision}));
    return unzipSync((await app.inject({url:`/api/artifacts/${exported.artifact.id}`,headers:{host:'127.0.0.1:4317',authorization:`Bearer ${app.studio.config.ownerToken}`}})).rawPayload);
  };
  return {call,inspect,add,remove,archive,
    create:async()=>ok(await call('projects.create',{preset:'empty',name:'Asset removal contract'})),
    restart:async()=>{await app.close();app=await createApp({dataDir});},
    close:async()=>{await app.close();assert.equal(resolve(dataDir,'..'),resolve(tmpdir()));rmSync(dataDir,{recursive:true,force:true});}};
}

test('assets.remove refuses active, disabled and locked references atomically, plus missing and duplicate IDs',async()=>{
  const f=await fixture();try {
    let p=await f.create();const a=await f.add(p,1);p=a.project;const b=await f.add(p,2);p=b.project;const c=await f.add(p,3);p=c.project;
    p=ok(await f.call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[
      {type:'layer.set',layerId:'sparks',values:{texture:`asset:${a.assetId}`}},
      {type:'layer.add',layer:{...makeMeshLayer('locked-disabled'),enabled:false,texture:`asset:${b.assetId}`}},
      {type:'locks.set',locks:[{layerId:'locked-disabled',field:'texture'},{layerId:'locked-disabled',field:'*'}]},
    ]}));
    let unchanged=await f.inspect(p.id);
    for(const ids of [[c.assetId,a.assetId],[b.assetId],[c.assetId,'f'.repeat(64)]]) {
      rejected(await f.remove(p,ids),ids.includes('f'.repeat(64))?'MISSING_ASSET':'ASSET_IN_USE');
      assert.deepEqual(await f.inspect(p.id),unchanged);
    }
    rejected(await f.remove(p,[c.assetId,c.assetId]),'VALIDATION_ERROR');
    assert.deepEqual(await f.inspect(p.id),unchanged);
    p=ok(await f.call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'sparks',values:{enabled:false}}]}));
    unchanged=await f.inspect(p.id);rejected(await f.remove(p,[c.assetId,a.assetId]),'ASSET_IN_USE');
    assert.deepEqual(await f.inspect(p.id),unchanged);
    const removed=ok(await f.remove(p,[c.assetId]));
    assert.deepEqual(removed.removedAssetIds,[c.assetId]);assert.equal(removed.project.revision,p.revision+1);
    assert.deepEqual(removed.project.document.assets.map((asset:any)=>asset.id),[a.assetId,b.assetId]);
  }finally{await f.close();}
});

test('assets.remove enforces edit/project scope, AI pause, revision CAS and stable idempotency replay',async()=>{
  const f=await fixture();try {
    let p=await f.create();const a=await f.add(p,1);p=a.project;const b=await f.add(p,2);p=b.project;
    const other=(await f.add(await f.create(),1)).project;
    const editor=ok(await f.call('actors.create',{name:'Asset editor',projectIds:[p.id],scopes:['read','edit']}));
    const reader=ok(await f.call('actors.create',{name:'Asset reader',projectIds:[p.id],scopes:['read']}));
    rejected(await f.remove(p,[a.assetId],{token:reader.token}),'FORBIDDEN');
    rejected(await f.remove(other,[a.assetId],{token:editor.token}),'FORBIDDEN');
    ok(await f.call('policy.set',{projectId:p.id,paused:true}));
    rejected(await f.remove(p,[a.assetId],{token:editor.token}),'AI_PAUSED');
    ok(await f.call('policy.set',{projectId:p.id,paused:false}));
    const key=randomUUID(), input={projectId:p.id,expectedRevision:p.revision,assetIds:[a.assetId]};
    const first=await f.call('assets.remove',input,{token:editor.token,key});p=ok(first).project;
    rejected(await f.call('assets.remove',{...input,assetIds:[b.assetId]},{token:editor.token}),'REVISION_CONFLICT');
    rejected(await f.call('assets.remove',{...input,assetIds:[b.assetId]},{token:editor.token,key}),'IDEMPOTENCY_CONFLICT');
    p=ok(await f.call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'sparks',values:{alpha:.63}}]}));
    ok(await f.call('policy.set',{projectId:p.id,paused:true}));
    await f.restart();
    const replay=await f.call('assets.remove',input,{token:editor.token,key});
    assert.equal(replay.operationId,first.operationId);assert.deepEqual(ok(replay),first.data);
    assert.equal((await f.inspect(p.id)).revision,p.revision);
    assert.equal((await f.inspect(p.id)).document.layers[0].alpha,.63);
    ok(await f.remove(p,[b.assetId])); // The human owner remains able to edit while AI is paused.
  }finally{await f.close();}
});

test('removed PNG bytes remain available in immutable revisions and portable ZIP after restart',async()=>{
  const f=await fixture();try {
    let p=await f.create();const a=await f.add(p,1);p=a.project;const b=await f.add(p,2);p=b.project;
    const historical=structuredClone(p);p=ok(await f.remove(p,[a.assetId])).project;
    rejected(await f.call('assets.get',{projectId:p.id,assetId:a.assetId}),'MISSING_ASSET');
    await f.restart();
    assert.equal(ok(await f.call('assets.get',{projectId:p.id,revision:historical.revision,assetId:a.assetId})).pngBase64,image(1).toString('base64'));
    assert.deepEqual(ok(await f.call('revisions.get',{projectId:p.id,revision:historical.revision})).document,historical.document);
    const oldZip=await f.archive(p.id,historical.revision),currentZip=await f.archive(p.id,p.revision);
    assert.equal(sha(oldZip[`assets/${a.assetId}.png`]),a.assetId);
    assert.deepEqual(Buffer.from(oldZip[`assets/${a.assetId}.png`]),image(1));
    assert.equal(currentZip[`assets/${a.assetId}.png`],undefined);
    assert.equal(sha(currentZip[`assets/${b.assetId}.png`]),b.assetId);
  }finally{await f.close();}
});

test('undo restores only removed assets and retains independent imports, field edits and later removals',async()=>{
  const f=await fixture();try {
    let p=await f.create();const a=await f.add(p,1);p=a.project;const b=await f.add(p,2);p=b.project;const c=await f.add(p,3);p=c.project;
    const oldA=structuredClone(p.document.assets[0]),oldB=structuredClone(p.document.assets[1]);
    const removed=await f.remove(p,[a.assetId,b.assetId]);p=ok(removed).project;
    const d=await f.add(p,4);p=d.project;
    p=ok(await f.call('changes.apply',{projectId:p.id,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'sparks',values:{midAlpha:.41}}]}));
    p=ok(await f.remove(p,[c.assetId])).project;
    p=ok(await f.call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:removed.operationId}));
    assert.deepEqual(p.document.assets.map((asset:any)=>asset.id),[a.assetId,b.assetId,d.assetId]);
    assert.deepEqual(p.document.assets[0],oldA);assert.deepEqual(p.document.assets[1],oldB);
    assert.equal(p.document.layers[0].midAlpha,.41);assert.equal(p.document.schemaVersion,3);
    await f.restart();assert.deepEqual((await f.inspect(p.id)).document,p.document);
  }finally{await f.close();}
});

test('undo refuses capacity overflow and same-ID reimport without partial restoration',async()=>{
  const f=await fixture();try {
    let p=await f.create();const a=await f.add(p,1);p=a.project;
    const removed=await f.remove(p,[a.assetId]);p=ok(removed).project;
    for(let index=2;index<=9;index++)p=(await f.add(p,index)).project;
    let unchanged=await f.inspect(p.id);
    rejected(await f.call('changes.revert',{projectId:p.id,expectedRevision:p.revision,operationId:removed.operationId}),'UNDO_CONFLICT');
    assert.deepEqual(await f.inspect(p.id),unchanged);assert.equal(unchanged.document.assets.length,8);
    let other=await f.create();const first=await f.add(other,1);other=first.project;
    const removal=await f.remove(other,[first.assetId]);other=ok(removal).project;
    other=(await f.add(other,1)).project;unchanged=await f.inspect(other.id);
    rejected(await f.call('changes.revert',{projectId:other.id,expectedRevision:other.revision,operationId:removal.operationId}),'UNDO_CONFLICT');
    assert.deepEqual(await f.inspect(other.id),unchanged);
    assert.equal(unchanged.document.assets.length,1);
  }finally{await f.close();}
});
