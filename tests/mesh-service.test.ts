import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import { createApp } from '../apps/service/src/app.js';
import { makeDocument,makeMeshLayer,type EffectDocument } from '../packages/core/src/model.js';

test('mesh changes persist, round-trip, fork, conflict and selectively undo through the shared operations',async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),'nwn-vfx-mesh-'));let app=await createApp({dataDir});
  const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,key=randomUUID())=>{
    const result=await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:`Bearer ${token}`},payload:{operation,input,idempotencyKey:key}});return result.json();
  };
  const ok=(r:any)=>{assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
  try {
    const project=ok(await call('projects.create',{name:'Generic geometry fixture',preset:'empty'}));
    const actor=ok(await call('actors.create',{name:'Mesh consumer',projectIds:[project.id],scopes:['read','edit','create','export']}));
    const added=ok(await call('changes.apply',{projectId:project.id,expectedRevision:1,changes:[{type:'layer.add',layer:makeMeshLayer('mesh')}]},actor.token));
    assert.equal(added.document.schemaVersion,2);
    const animation={position:[{time:0,value:[0,0,2]},{time:1,value:[0,0,0]}],alpha:[{time:0,value:0},{time:.2,value:1},{time:3,value:0}]};
    const changed=await call('changes.apply',{projectId:project.id,expectedRevision:2,changes:[{type:'layer.set',layerId:'mesh',values:{animation}}]},actor.token);ok(changed);
    const current=ok(await call('changes.apply',{projectId:project.id,expectedRevision:3,changes:[{type:'layer.set',layerId:'mesh',values:{color:'#bbaa77'}}]},actor.token));
    assert.equal((await call('changes.apply',{projectId:project.id,expectedRevision:2,changes:[{type:'layer.set',layerId:'mesh',values:{scale:2}}]},actor.token)).error.code,'REVISION_CONFLICT');
    const undone=ok(await call('changes.revert',{projectId:project.id,expectedRevision:4,operationId:changed.operationId},actor.token));
    assert.deepEqual(undone.document.layers.find((l:any)=>l.id==='mesh').animation,{});
    assert.equal(undone.document.layers.find((l:any)=>l.id==='mesh').color,'#bbaa77');
    const fork=ok(await call('projects.fork',{projectId:project.id,revision:4,name:'Animation preserved'},actor.token));
    // A fork changes its document name, but preserves every authored layer.
    assert.deepEqual(fork.document.layers,current.document.layers);
    const imported=ok(await call('projects.import',{document:current.document}));assert.deepEqual(imported.document,current.document);
    const locked=ok(await call('changes.apply',{projectId:project.id,expectedRevision:5,changes:[{type:'locks.set',locks:[{layerId:'mesh',field:'geometry'}]}]}));
    assert.equal((await call('changes.apply',{projectId:project.id,expectedRevision:locked.revision,changes:[{type:'layer.set',layerId:'mesh',values:{geometry:{kind:'box',dimensions:[1,1,1]}}}]},actor.token)).error.code,'LOCKED');
    await app.close();app=await createApp({dataDir});
    const reloaded=ok(await call('projects.inspect',{projectId:fork.id}));assert.deepEqual(reloaded.document.layers,current.document.layers);
    const history=ok(await call('revisions.list',{projectId:project.id}));assert.equal(history.items.find((r:any)=>r.revision===3).actorId,actor.id);
  } finally {await app.close();const target=resolve(dataDir);assert.ok(target.startsWith(resolve(tmpdir())+'\\'));rmSync(target,{recursive:true,force:true});}
});

test('large valid geometry round-trips through portable ZIP including project JSON above the old 2 MiB limit',async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),'nwn-vfx-mesh-large-')),app=await createApp({dataDir});
  const headers={host:'127.0.0.1:4317',authorization:`Bearer ${app.studio.config.ownerToken}`};
  async function call(operation:string,input:object){const r=(await app.inject({method:'POST',url:'/api/commands',headers,payload:{operation,input,idempotencyKey:randomUUID()}})).json();assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;}
  try {
    const doc:EffectDocument={...makeDocument('empty'),schemaVersion:2,layers:Array.from({length:16},(_,i)=>({...makeMeshLayer(`mesh-${i}`,'Repeated triangles','custom'),
      geometry:{kind:'custom' as const,vertices:[[0,0,0],[1,0,0],[0,1,0]] as [number,number,number][],faces:Array.from({length:4096},()=>[0,1,2] as [number,number,number])}}))};
    const pretty=strToU8(JSON.stringify(doc,null,2));assert.ok(pretty.length>2*1024*1024);
    const original=await call('projects.import',{document:doc});
    const exported=await call('projects.export',{projectId:original.id,revision:1});
    const bytes=(await app.inject({url:`/api/artifacts/${exported.artifact.id}`,headers})).rawPayload;
    const restored=await call('projects.import',{bundleBase64:bytes.toString('base64')});assert.deepEqual(restored.document,doc);
    const legacy=zipSync({'project.json':pretty,'manifest.json':strToU8(JSON.stringify({schemaVersion:1,documentSha256:createHash('sha256').update(pretty).digest('hex')}))});
    const legacyRestored=await call('projects.import',{bundleBase64:Buffer.from(legacy).toString('base64')});assert.deepEqual(legacyRestored.document,doc);
  } finally {await app.close();assert.equal(resolve(dataDir,'..'),resolve(tmpdir()));rmSync(dataDir,{recursive:true,force:true});}
});
