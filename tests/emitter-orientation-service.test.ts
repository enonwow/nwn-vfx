import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/service/src/app.js';
import { makeDocument, makeLayer, makeMeshLayer, type AxisAngle } from '../packages/core/src/model.js';
import { EMITTER_ORIENTATION_CAPABILITIES } from '../packages/core/src/simulation.js';
import { rgbaPng } from './fixtures/rgba-texture.js';

const xAxis:AxisAngle=[0,1,0,Math.PI/2],yAxis:AxisAngle=[1,0,0,-Math.PI/2];
const ok=(result:any)=>{assert.notEqual(result.status,'failed',JSON.stringify(result.error));return result.data;};
async function fixture() {
  const dataDir=mkdtempSync(join(tmpdir(),'nwn-vfx-emitter-orientation-'));let app=await createApp({dataDir});
  const call=async(operation:string,input:object={},token=app.studio.config.ownerToken,key=randomUUID())=>
    (await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:`Bearer ${token}`},payload:{operation,input,idempotencyKey:key}})).json();
  return {call,get app(){return app;},async restart(){await app.close();app=await createApp({dataDir});},async close(){await app.close();assert.equal(resolve(dataDir,'..'),resolve(tmpdir()));rmSync(dataDir,{recursive:true,force:true});}};
}

test('emitter orientation validates through API, persists exact history, replays once and selectively undoes across restart',async()=>{
  const f=await fixture();
  try {
    const project=ok(await f.call('projects.create',{name:'Orientation history',preset:'empty'}));
    assert.equal(project.document.schemaVersion,1);assert.equal(Object.hasOwn(project.document.layers[0],'orientation'),false);
    const actor=ok(await f.call('actors.create',{name:'Orientation consumer',projectIds:[project.id],scopes:['read','edit','create','export','artifacts']}));
    const change=(orientation:unknown,revision:number)=>({projectId:project.id,expectedRevision:revision,changes:[{type:'layer.set',layerId:'sparks',values:{orientation}}]});
    for(const value of [[0,0,0,1],[0,0,2,1],[0,1,0,Math.PI*9],[0,1,0]]) {
      assert.equal((await f.call('changes.apply',change(value,1),actor.token)).error.code,'VALIDATION_ERROR');
      assert.equal((await f.call('changes.preview',change(value,1),actor.token)).error.code,'VALIDATION_ERROR');
    }
    assert.equal(ok(await f.call('projects.inspect',{projectId:project.id})).revision,1);
    const preview=ok(await f.call('changes.preview',change(xAxis,1),actor.token));assert.equal(preview.document.schemaVersion,4);
    assert.deepEqual(preview.diff.find((d:any)=>d.path==='/layers/sparks/orientation'),{path:'/layers/sparks/orientation',before:null,after:xAxis});
    const key=randomUUID(),oriented=await f.call('changes.apply',change(xAxis,1),actor.token,key);assert.equal(ok(oriented).revision,2);
    const replay=await f.call('changes.apply',change(xAxis,1),actor.token,key);assert.equal(replay.operationId,oriented.operationId);assert.equal(ok(replay).revision,2);
    assert.equal((await f.call('changes.apply',change(yAxis,1),actor.token)).error.code,'REVISION_CONFLICT');
    ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:2,changes:[{type:'layer.set',layerId:'sparks',values:{color:'#123456'}}]},actor.token));
    await f.restart();
    const undone=ok(await f.call('changes.revert',{projectId:project.id,expectedRevision:3,operationId:oriented.operationId},actor.token));
    assert.equal(undone.document.schemaVersion,4);assert.equal(Object.hasOwn(undone.document.layers[0],'orientation'),false);assert.equal(undone.document.layers[0].color,'#123456');
    const historical=ok(await f.call('revisions.get',{projectId:project.id,revision:2},actor.token));assert.deepEqual(historical.document.layers[0].orientation,xAxis);
    const operation=ok(await f.call('operations.get',{operationId:oriented.operationId},actor.token));assert.equal(operation.actorId,actor.id);assert.equal(operation.diff.filter((d:any)=>d.path==='/layers/sparks/orientation').length,1);
    const original=ok(await f.call('revisions.get',{projectId:project.id,revision:1},actor.token));assert.deepEqual(original.document,project.document);
    const fork=ok(await f.call('projects.fork',{projectId:project.id,revision:2,name:'Oriented snapshot'},actor.token));assert.deepEqual(fork.document.layers,historical.document.layers);
    const portable=ok(await f.call('projects.export',{projectId:project.id,revision:2},actor.token));
    const download=await f.app.inject({url:`/api/artifacts/${portable.artifact.id}`,headers:{host:'127.0.0.1:4317',authorization:`Bearer ${actor.token}`}});
    assert.equal(download.statusCode,200,download.body);const bytes=download.rawPayload;
    const imported=ok(await f.call('projects.import',{bundleBase64:bytes.toString('base64')}));assert.deepEqual(imported.document,historical.document);
    const cleared=await f.call('changes.apply',{projectId:imported.id,expectedRevision:1,changes:[{type:'layer.set',layerId:'sparks',values:{orientation:null}}]});ok(cleared);
    const restored=ok(await f.call('changes.revert',{projectId:imported.id,expectedRevision:2,operationId:cleared.operationId}));assert.deepEqual(restored.document.layers[0].orientation,xAxis);
  } finally {await f.close();}
});

test('orientation layer.add, field locks, pause policy and dependent undo use the shared control path',async()=>{
  const f=await fixture();
  try {
    const project=ok(await f.call('projects.create',{preset:'empty'}));
    const actor=ok(await f.call('actors.create',{name:'Limited consumer',projectIds:[project.id],scopes:['read','edit']}));
    const mutate=(expectedRevision:number,changes:object[],token?:string)=>f.call('changes.apply',{projectId:project.id,expectedRevision,changes},token);
    assert.equal((await mutate(1,[{type:'layer.add',layer:{...makeLayer('bad'),orientation:[0,0,0,1]}}],actor.token)).error.code,'VALIDATION_ERROR');
    const added=ok(await mutate(1,[{type:'layer.add',layer:{...makeLayer('horizontal'),orientation:xAxis}},{type:'layer.add',layer:makeMeshLayer('mesh')}],actor.token));
    assert.equal(added.document.schemaVersion,4);
    assert.equal((await mutate(2,[{type:'layer.set',layerId:'mesh',values:{orientation:null}}],actor.token)).error.code,'VALIDATION_ERROR');
    ok(await mutate(2,[{type:'locks.set',locks:[{layerId:'horizontal',field:'orientation'}]}]));
    for(const orientation of [yAxis,null])assert.equal((await mutate(3,[{type:'layer.set',layerId:'horizontal',values:{orientation}}],actor.token)).error.code,'LOCKED');
    assert.equal((await mutate(3,[{type:'layer.remove',layerId:'horizontal'}],actor.token)).error.code,'LOCKED');
    ok(await mutate(3,[{type:'layer.set',layerId:'horizontal',values:{alpha:.7}}],actor.token));
    ok(await f.call('policy.set',{projectId:project.id,paused:true}));
    assert.equal((await mutate(4,[{type:'layer.set',layerId:'sparks',values:{orientation:yAxis}}],actor.token)).error.code,'AI_PAUSED');
    ok(await f.call('policy.set',{projectId:project.id,paused:false}));
    ok(await mutate(4,[{type:'locks.set',locks:[]} ]));
    const first=await mutate(5,[{type:'layer.set',layerId:'horizontal',values:{orientation:yAxis}}],actor.token);ok(first);
    ok(await mutate(6,[{type:'layer.set',layerId:'horizontal',values:{orientation:xAxis}}],actor.token));
    assert.equal((await f.call('changes.revert',{projectId:project.id,expectedRevision:7,operationId:first.operationId},actor.token)).error.code,'UNDO_CONFLICT');
    const current=ok(await f.call('projects.inspect',{projectId:project.id}));assert.equal(current.revision,7);assert.deepEqual(current.document.layers.find((l:any)=>l.id==='horizontal').orientation,xAxis);
  } finally {await f.close();}
});

test('schema discovery exposes orientation and asset import cannot demote a schema 4 document',async()=>{
  const f=await fixture();
  try {
    const capabilities=ok(await f.call('capabilities'));assert.deepEqual(capabilities.documentSchemaVersions,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]);assert.deepEqual(capabilities.emitterOrientation,EMITTER_ORIENTATION_CAPABILITIES);
    const discovered=ok(await f.call('schema.get',{operation:'changes.apply'}));
    const validate=new Ajv({strict:false}).compile(discovered.inputSchema);
    assert.equal(validate({projectId:'project',expectedRevision:1,changes:[{type:'layer.set',layerId:'sparks',values:{orientation:null}}]}),true);
    const document={...makeDocument('empty'),schemaVersion:4,layers:[{...makeLayer('sparks'),orientation:xAxis}]};
    const project=ok(await f.call('projects.import',{document}));
    const pngBase64=Buffer.from(rgbaPng(8,8,()=>[200,100,20,255])).toString('base64');
    const imported=await f.call('assets.import',{projectId:project.id,expectedRevision:1,fileName:'orientation.png',pngBase64});
    const withAsset=ok(imported);assert.equal(withAsset.project.document.schemaVersion,4);assert.deepEqual(withAsset.project.document.layers[0].orientation,xAxis);
    const reset=ok(await f.call('changes.apply',{projectId:project.id,expectedRevision:2,changes:[{type:'layer.set',layerId:'sparks',values:{orientation:null,midAlpha:.5}}]}));assert.equal(reset.document.schemaVersion,4);
    const withoutAsset=ok(await f.call('changes.revert',{projectId:project.id,expectedRevision:3,operationId:imported.operationId}));
    assert.equal(withoutAsset.document.schemaVersion,4);assert.equal(withoutAsset.document.layers[0].midAlpha,.5);assert.equal(Object.hasOwn(withoutAsset.document.layers[0],'orientation'),false);assert.equal(withoutAsset.document.assets?.length??0,0);
  } finally {await f.close();}
});
