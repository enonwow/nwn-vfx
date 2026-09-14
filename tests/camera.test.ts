import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { PerspectiveCamera, Vector3 } from 'three';
import { assertPreviewCamera, DEFAULT_PREVIEW_CAMERA } from '../packages/core/src/camera.js';
import { validateOperationInput } from '../packages/contracts/src/schema.js';
import { validateToolInput } from '../apps/web/src/browser-contracts.js';
import { EffectRenderer } from '../packages/renderer/src/index.js';
import { createApp } from '../apps/service/src/app.js';
import { STUDIO_VERSION } from '../packages/core/src/model.js';

const camera = {position:[7,-11,6],target:[0,0,2.6],fov:45};
const input = {projectId:'test-project',revision:1,format:'png'};
test('camera validation agrees in shared operations and WebMCP, including semantic degeneracy and nonfinite values',()=>{
  validateOperationInput('preview.request',input);
  for(const value of [camera,DEFAULT_PREVIEW_CAMERA,{position:[30,-20,15],target:[0,0,3],fov:60}]) {
    validateOperationInput('preview.request',{...input,camera:value});
    validateToolInput('studio.preview.request',{viewSessionId:'test-view',input:{...input,camera:value},idempotencyKey:'camera-key'});
  }
  const invalid = [null,{},[],{...camera,extra:1},{...camera,fov:9},{...camera,fov:121},{...camera,fov:NaN},
    {...camera,position:[Infinity,0,0]},{...camera,target:[0,0,101]},{...camera,position:[0,0]},
    {...camera,position:camera.target},{...camera,position:[0,0,5]},{...camera,position:[0,.01,2.6]},
    {...camera,position:[100,100,100],target:[-100,-100,-100]}];
  for (const value of invalid) {
    assert.throws(()=>validateOperationInput('preview.request',{...input,camera:value}),JSON.stringify(value));
    assert.throws(()=>validateToolInput('studio.preview.request',{viewSessionId:'test-view',input:{...input,camera:value},idempotencyKey:'camera-key'}));
  }
});

test('explicit export camera bypasses orbit distance/polar clamps and frames the full high composition',()=>{
  const stage = {camera:new PerspectiveCamera(39,960/640,.05,100),controls:{target:new Vector3()}};
  stage.camera.up.set(0,0,1);
  const large = {position:[0,-20,8],target:[0,0,2.6],fov:45}; assertPreviewCamera(large);
  EffectRenderer.prototype.setRenderCamera.call(stage as unknown as EffectRenderer,large);
  assert.deepEqual(stage.camera.position.toArray(),large.position);
  assert.deepEqual(stage.controls.target.toArray(),large.target); assert.equal(stage.camera.fov,45);
  for (const point of [[0,0,2.3],[0,0,5.2],[-3,-3,0],[3,3,0],[-3,3,0],[3,-3,0]]) {
    const p=new Vector3(...point).project(stage.camera);
    assert(Math.abs(p.x)<.9 && Math.abs(p.y)<.9 && p.z>-1 && p.z<1,JSON.stringify({point,projected:p}));
  }
});

test('camera is a durable job option with idempotency and handoff metadata, never a document mutation',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'nwn-vfx-camera-')), observed:unknown[]=[];
  const app=await createApp({dataDir,render:async(doc,options)=>{
    observed.push(structuredClone({...options,signal:undefined}));
    return {files:[{name:'preview.png',data:Uint8Array.of(1,2,3)}],metadata:{rendererVersion:STUDIO_VERSION,
      documentSchemaVersion:doc.schemaVersion,format:options.format,time:options.time,duration:doc.duration,seed:doc.seed,
      camera:options.camera??DEFAULT_PREVIEW_CAMERA,resolution:[960,640],approximation:true,nativeVerified:false,limitations:[]}};
  }});
  const headers={host:'127.0.0.1:4317',authorization:`Bearer ${app.studio.config.ownerToken}`};
  const call=async(operation:string,input:object,key:string=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers,
    payload:{operation,input,idempotencyKey:key}})).json();
  try {
    const project=(await call('projects.create',{preset:'empty',name:'Camera fixture'})).data;
    const args={projectId:project.id,revision:1,format:'webm',camera};
    const accepted=await call('preview.request',args,'durable-camera-key'); assert.equal(accepted.status,'accepted');
    assert.equal((await call('preview.request',args,'durable-camera-key')).data.id,accepted.data.id);
    assert.equal((await call('preview.request',{...args,camera:{...camera,fov:60}},'durable-camera-key')).error.code,'IDEMPOTENCY_CONFLICT');
    const count=app.studio.db.prepare('SELECT count(*) AS n FROM jobs').get() as any;
    assert.equal((await call('preview.request',{...args,camera:{...camera,position:camera.target}})).error.code,'VALIDATION_ERROR');
    assert.deepEqual(app.studio.db.prepare('SELECT count(*) AS n FROM jobs').get(),count);
    await call('preview.request',{projectId:project.id,revision:1}); await app.studio.drainJobs();
    const job=(await call('jobs.get',{jobId:accepted.data.id})).data;
    assert.equal(job.status,'succeeded'); assert.deepEqual(job.metadata.camera,camera);
    const handoff=job.artifacts.find((a:any)=>a.name==='handoff.json');
    const manifest=(await app.inject({url:handoff.downloadUrl,headers})).json();
    assert.deepEqual(manifest.metadata.camera,camera); assert.equal(manifest.revision,1);
    assert.deepEqual((observed[0] as any).camera,camera); assert.equal((observed[1] as any).camera,undefined);
    assert.deepEqual((await call('projects.inspect',{projectId:project.id})).data,project);
  } finally {
    await app.close(); assert.equal(resolve(dirname(dataDir)),resolve(tmpdir())); assert(basename(dataDir).startsWith('nwn-vfx-camera-'));
    await rm(dataDir,{recursive:true,force:true});
  }
});
