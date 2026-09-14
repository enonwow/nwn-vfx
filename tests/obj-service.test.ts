import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/service/src/app.js';
import { makeMeshLayer } from '../packages/core/src/model.js';
import { orientationTexture } from './fixtures/rgba-texture.js';

const objText = 'v 0 0 0\nv 2 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n';
const options = {fileName:'asymmetric.obj',objText,sourceUpAxis:'z',metersPerUnit:1,normalMode:'flat',target:{layerId:'mesh'}};
const ok=(result:any):any=>{assert.equal(result.status,'ok',JSON.stringify(result.error));return result.data;};
async function fixture() {
  const dataDir=mkdtempSync(join(tmpdir(),'nwn-vfx-obj-service-')); let app=await createApp({dataDir});
  const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',
    headers:{host:'127.0.0.1:4317',authorization:`Bearer ${token}`},payload:{operation,input,idempotencyKey:key}})).json();
  return {get app(){return app;},call,restart:async()=>{await app.close();app=await createApp({dataDir});},close:async()=>{
    await app.close();assert.equal(resolve(dataDir,'..'),resolve(tmpdir()));rmSync(dataDir,{recursive:true,force:true});}};
}
async function setup(f:Awaited<ReturnType<typeof fixture>>) {
  let project=ok(await f.call('projects.create',{preset:'empty'}));
  const layer={...makeMeshLayer('mesh'),start:.2,duration:2,animation:{orientation:[{time:0,value:[0,0,1,0]},{time:2,value:[0,0,1,1]}]}};
  project=ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:1,changes:[{type:'layer.add',layer}]}));
  const imported=ok(await f.call('assets.import',{projectId:project.id,expectedRevision:2,fileName:'orientation.png',pngBase64:Buffer.from(orientationTexture(8)).toString('base64')}));
  const actor=ok(await f.call('actors.create',{name:'OBJ consumer',projectIds:[project.id],scopes:['read','edit','export','build','jobs','artifacts']}));
  return {project:imported.project,assetId:imported.assetId,actor,layer};
}

test('OBJ public import preview, stable replay, independent undo, history and portable bytes retain mesh identity and tracks',async()=>{
  const f=await fixture();try {
    const {project,assetId,actor,layer}=await setup(f),input={...options,projectId:project.id,expectedRevision:3,textureAssetId:assetId},key=randomUUID();
    const preview=ok(await f.call('meshes.importObj.preview',input,actor.token));
    assert.deepEqual(preview.diff.map((diff:any)=>diff.path),['/layers/mesh/geometry','/layers/mesh/texture']);
    assert.equal(ok(await f.call('projects.inspect',{projectId:project.id})).revision,3);
    const imported=await f.call('meshes.importObj',input,actor.token,key),data=ok(imported),mesh=data.project.document.layers[1];
    assert.equal(data.project.revision,4);assert.equal(data.report.uv.present,true);
    assert.deepEqual(mesh,{...layer,geometry:{kind:'custom',vertices:[[0,0,0],[2,0,0],[0,1,0]],faces:[[0,1,2]],uv:[[0,0],[1,0],[0,1]],uvFaces:[[0,1,2]]},texture:`asset:${assetId}`});
    assert.deepEqual(ok(await f.call('meshes.importObj',input,actor.token,key)),data);
    assert.equal((await f.call('meshes.importObj',{...input,metersPerUnit:.5},actor.token,key)).error.code,'IDEMPOTENCY_CONFLICT');
    assert.equal((await f.call('meshes.importObj',input,actor.token)).error.code,'REVISION_CONFLICT');
    const operation=ok(await f.call('operations.get',{operationId:imported.operationId},actor.token));
    assert.equal(operation.actorId,actor.id);assert.equal(operation.input.objText,objText);
    let current=ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:4,changes:[{type:'layer.set',layerId:'mesh',values:{color:'#123456'}}]},actor.token));
    current=ok(await f.call('changes.revert',{projectId:project.id,expectedRevision:5,operationId:imported.operationId},actor.token));
    assert.deepEqual(current.document.layers[1],{...layer,color:'#123456'});
    assert.equal(current.document.assets[0].id,assetId);
    await f.restart();
    assert.deepEqual(ok(await f.call('revisions.get',{projectId:project.id,revision:4})).document,data.project.document);
    const history=ok(await f.call('revisions.list',{projectId:project.id})).items.find((entry:any)=>entry.revision===4);
    assert.equal(history.actorId,actor.id);assert.ok(history.committedAt);
    const exported=ok(await f.call('projects.export',{projectId:project.id,revision:4}));
    const zip=(await f.app.inject({url:exported.artifact.downloadUrl,headers:{host:'127.0.0.1:4317',authorization:`Bearer ${f.app.studio.config.ownerToken}`}})).rawPayload;
    const restored=ok(await f.call('projects.import',{bundleBase64:zip.toString('base64')}));
    assert.deepEqual(restored.document,data.project.document);
  } finally {await f.close();}
});

test('OBJ import WebMCP honors locked fields, pause, scoped authority, validation and immutable target revision',async()=>{
  const f=await fixture();try {
    const {project,assetId}=await setup(f),origin='http://127.0.0.1:4317';
    const bootstrap=await f.app.inject({url:'/api/session',headers:{host:'127.0.0.1:4317',referer:origin+'/', 'sec-fetch-site':'same-origin'}});
    const cookie=String(bootstrap.headers['set-cookie']).split(';')[0];
    const headers={host:'127.0.0.1:4317',origin,cookie,'sec-fetch-site':'same-origin'};
    const grant=(await f.app.inject({method:'POST',url:'/api/webmcp/sessions',headers,payload:{projectId:project.id,viewSessionId:randomUUID()}})).json();
    const web=async(operation:string,input:object,key=randomUUID())=>(await f.app.inject({method:'POST',url:'/api/webmcp/commands',headers:{...headers,'x-nwn-view-session':grant.viewSessionId,'x-nwn-webmcp-session':grant.token},payload:{operation,input,idempotencyKey:key}})).json();
    const input={...options,projectId:project.id,expectedRevision:3,textureAssetId:assetId};
    for(const change of [{objText:'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3'}, {target:{layerId:'sparks'}}, {target:{layerId:'missing'}}, {textureAssetId:'a'.repeat(64)}, {objText:objText+'mtllib external.mtl\n'}]) {
      assert.equal((await web('meshes.importObj',{...input,...change})).status,'failed');
      assert.equal(ok(await f.call('projects.inspect',{projectId:project.id})).revision,3);
    }
    ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:3,changes:[{type:'locks.set',locks:[{layerId:'mesh',field:'geometry'}]}]}));
    assert.equal((await web('meshes.importObj',{...input,expectedRevision:4})).error.code,'LOCKED');
    assert.equal((await web('meshes.importObj.preview',{...input,expectedRevision:4})).error.code,'LOCKED');
    ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:4,changes:[{type:'locks.set',locks:[]}]}));
    ok(await f.call('policy.set',{projectId:project.id,paused:true}));
    assert.equal((await web('meshes.importObj',{...input,expectedRevision:5})).error.code,'AI_PAUSED');
    ok(await web('meshes.importObj.preview',{...input,expectedRevision:5}));
    ok(await f.call('policy.set',{projectId:project.id,paused:false}));
    const result=await web('meshes.importObj',{...input,expectedRevision:5}),saved=ok(result);
    assert.equal(saved.project.revision,6);
    assert.equal(ok(await f.call('operations.get',{operationId:result.operationId})).actorId,grant.actorId);
    const outsider=ok(await f.call('projects.create',{preset:'empty'}));
    assert.equal((await web('meshes.importObj',{...input,projectId:outsider.id,expectedRevision:1})).error.code,'FORBIDDEN');
    const readOnly=ok(await f.call('actors.create',{name:'Reader',projectIds:[project.id],scopes:['read']}));
    assert.equal((await f.call('meshes.importObj.preview',{...input,expectedRevision:6},readOnly.token)).error.code,'FORBIDDEN');
    const build=await web('candidate.build',{projectId:project.id,revision:6});assert.equal(build.status,'accepted');
    await f.app.studio.drainJobs();const job=ok(await web('jobs.get',{jobId:build.data.id}));
    assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert.equal(job.revision,6);assert.equal(job.metadata.validation.nativeVerified,false);
    assert.deepEqual(job.metadata.validation.readback.meshes[0].uv,saved.project.document.layers[1].geometry.uv);
    const artifact=job.artifacts.find((item:any)=>item.name.endsWith('.hak'));assert.ok(artifact);
    ok(await web('artifacts.get',{artifactId:artifact.id}));
  } finally {await f.close();}
});

test('material is atomic, promotes only when authored, undoes without schema downgrade and respects whole-field locks',async()=>{
  const f=await fixture();try {
    const {project,actor}=await setup(f),material={diffuse:'#765432',selfIllumination:'#010203'};
    const authored=await f.call('changes.apply',{projectId:project.id,expectedRevision:3,changes:[{type:'layer.set',layerId:'mesh',values:{material}}]},actor.token);
    const data=ok(authored);assert.equal(data.document.schemaVersion,5);
    assert.deepEqual(data.diff.find((entry:any)=>entry.path==='/layers/mesh/material'),{path:'/layers/mesh/material',before:null,after:material});
    assert.equal((await f.call('changes.apply',{projectId:project.id,expectedRevision:4,changes:[{type:'layer.set',layerId:'sparks',values:{material}}]},actor.token)).error.code,'VALIDATION_ERROR');
    const current=ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:4,changes:[{type:'layer.set',layerId:'sparks',values:{orientation:[0,0,1,.5]}}]},actor.token));
    assert.equal(current.document.schemaVersion,5,'emitter orientation must never downgrade schema 5');
    const undone=ok(await f.call('changes.revert',{projectId:project.id,expectedRevision:5,operationId:authored.operationId},actor.token));
    assert.equal(undone.document.schemaVersion,5);assert.equal(Object.hasOwn(undone.document.layers[1],'material'),false);
    ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:6,changes:[{type:'locks.set',locks:[{layerId:'mesh',field:'material'}]}]}));
    assert.equal((await f.call('changes.apply',{projectId:project.id,expectedRevision:7,changes:[{type:'layer.set',layerId:'mesh',values:{material}}]},actor.token)).error.code,'LOCKED');
    const {geometry:_,...newLayer}=makeMeshLayer('imported');
    const response=await f.call('meshes.importObj',{...options,projectId:project.id,expectedRevision:7,target:{newLayer}},actor.token),imported=ok(response);
    assert.equal(imported.project.document.layers[2].id,'imported');
    const reversed=ok(await f.call('changes.revert',{projectId:project.id,expectedRevision:8,operationId:response.operationId},actor.token));
    assert.equal(reversed.document.layers.length,2);assert.deepEqual(reversed.document.locks,[{layerId:'mesh',field:'material'}]);
  } finally {await f.close();}
});
