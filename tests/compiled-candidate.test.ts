import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { makeDocument, makeMeshLayer, makeTrailLayer, type EffectDocument } from '../packages/core/src/model.js';
import { BINARY_PROFILE_ID } from '../packages/core/src/export-profiles.js';
import { buildCandidate, readHak } from '../packages/nwn-format/src/index.js';
import { binaryCompilerAvailable, buildCompiledCandidate } from '../packages/nwn-format/src/compiled-candidate.js';
import { verifyCompiledRoundtrip } from '../packages/nwn-format/src/compiled-readback.js';
import { createApp } from '../apps/service/src/app.js';
import { validateOperationOutput } from '../packages/contracts/src/schema.js';
import { shadingExample } from './fixtures/mesh-shading.js';
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const enabled=binaryCompilerAvailable();
test('binary compiler accepts independent UV corners with identical float32 values',{skip:!enabled},async()=>{
  const {document:doc,layer}=shadingExample();
  assert.equal(layer.geometry.kind,'custom');
  if(layer.geometry.kind!=='custom')throw new Error('Custom fixture required');
  layer.geometry.uv=layer.geometry.uv!.map(([u,v],i)=>[u,v===.9?(i%2?.96:.9600000000000001):v]);
  const result=await buildCompiledCandidate(doc,'uv_alias');
  assert.equal(result.validation.compilation!.roundtripVerified,true);
  assert.equal(result.validation.compilation!.normalReadback.corners,layer.geometry.faces.length*3);
  assert.equal(result.validation.nativeVerified,false);
});
function document():EffectDocument {
  const doc=makeDocument('empty');
  return {...doc,schemaVersion:6,layers:[...doc.layers,makeMeshLayer('control'),{...makeTrailLayer('path'),maxSegmentLength:1,path:[{time:0,position:[0,0,.3] as [number,number,number]},{time:1,position:[0,0,1.3] as [number,number,number]}]}]};
}

test('binary profile preserves mixed source, winding, animation, dependencies and exact HAK resources',{skip:!enabled},async()=>{
  const doc=document(),original=JSON.stringify(doc),ascii=buildCandidate(doc,'binary_test');
  const result=await buildCompiledCandidate(doc,'binary_test');
  assert.equal(JSON.stringify(doc),original);
  const mdl=result.files.find(f=>f.name==='binary_test.mdl')!.data;
  assert.equal(Buffer.from(mdl).readUInt32LE(0),0);
  assert.equal(result.validation.profileId,BINARY_PROFILE_ID);
  assert.equal(result.validation.nativeVerified,false);
  const proof=result.validation.compilation!;
  assert(proof.vertexSamples>0&&proof.controllers>0&&proof.roundtripVerified);
  assert.equal(hash(mdl),proof.binaryMdlSha256);
  assert.equal(hash(ascii.files.find(f=>f.name==='binary_test.mdl')!.data),proof.sourceMdlSha256);
  const unpacked=readHak(result.files.find(f=>f.name==='binary_test.hak')!.data);
  assert.equal(hash(unpacked.find(f=>f.name==='binary_test.mdl')!.data),hash(mdl));
  for(const f of ascii.files.filter(f=>/\.(tga|txi)$/.test(f.name)))assert.deepEqual(unpacked.find(x=>x.name===f.name)!.data,f.data);
  for(const file of result.validation.resources)assert.equal(hash(result.files.find(f=>f.name===file.name)!.data),file.sha256);
  const source=result.files.find(f=>f.name==='source-model.mdl.txt')!.data;
  const roundtrip=result.files.find(f=>f.name==='compiled-roundtrip.mdl.txt')!.data;
  const text=new TextDecoder().decode(roundtrip);
  assert.throws(()=>verifyCompiledRoundtrip(source,new TextEncoder().encode(text.replace(/(animverts \d+\s+)[^\r\n]+/,'$1 99 99 99'))),{code:'COMPILE_VALIDATION_FAILED'});
  const missingAlpha=text.replace(/alphakey/i,'discardedalphakey');
  assert(missingAlpha!==text,'Expected a decompiled alpha controller fixture');
  assert.throws(()=>verifyCompiledRoundtrip(source,new TextEncoder().encode(missingAlpha)),{code:'COMPILE_VALIDATION_FAILED'});
});

test('public binary candidate jobs respect grants, pause, profile identities, retry and artifact handoff',{skip:!enabled},async()=>{
  const root=resolve(tmpdir()),dir=mkdtempSync(join(root,'nwn-vfx-compiled-test-')),app=await createApp({dataDir:dir});
  const call=async(operation:string,input:Record<string,unknown>,token=app.studio.config.ownerToken,key=randomUUID())=>(await app.inject({method:'POST',url:'/api/commands',headers:{host:'127.0.0.1:4317',authorization:`Bearer ${token}`},payload:{operation,input,idempotencyKey:key}})).json();
  try {
    const p=(await call('projects.import',{document:document()})).data;
    const capabilities=(await call('capabilities',{})).data;
    assert(capabilities.exportProfiles.find((x:any)=>x.id===BINARY_PROFILE_ID).available);
    const actor=(await call('actors.create',{name:'Binary test agent',projectIds:[p.id],scopes:['read','build','jobs','artifacts']})).data;
    const input={projectId:p.id,revision:p.revision,profileId:BINARY_PROFILE_ID};
    await call('policy.set',{projectId:p.id,paused:true});
    assert.equal((await call('candidate.build',input,actor.token)).error.code,'AI_PAUSED');
    await call('policy.set',{projectId:p.id,paused:false});
    const key=randomUUID(),accepted=await call('candidate.build',input,actor.token,key);
    assert.equal(accepted.status,'accepted',JSON.stringify(accepted.error));
    assert.equal((await call('candidate.build',input,actor.token,key)).data.id,accepted.data.id);
    await app.studio.drainJobs();
    const job=(await call('jobs.get',{jobId:accepted.data.id},actor.token)).data;
    assert.equal(job.status,'succeeded',JSON.stringify(job.error));
    validateOperationOutput('jobs.get',job);
    assert.equal(job.metadata.validation.profileId,BINARY_PROFILE_ID);
    const ascii=await call('candidate.build',{projectId:p.id,revision:p.revision});await app.studio.drainJobs();
    const asciiJob=(await call('jobs.get',{jobId:ascii.data.id})).data;
    assert.notEqual(job.metadata.modelName,asciiJob.metadata.modelName);
    const manifestArtifact=job.artifacts.find((a:any)=>a.name==='handoff.json');
    const response=await app.inject({url:`/api/artifacts/${manifestArtifact.id}`,headers:{host:'127.0.0.1:4317',authorization:`Bearer ${actor.token}`}});
    const manifest=JSON.parse(response.body);assert.equal(manifest.profileId,BINARY_PROFILE_ID);assert.equal(manifest.revision,p.revision);
    const after=(await call('projects.inspect',{projectId:p.id})).data;assert.deepEqual(after,p);
    assert.equal((await call('candidate.build',{...input,profileId:'unknown'})).error.code,'CAPABILITY_UNAVAILABLE');
  }finally{await app.close();assert.equal(dirname(dir),root);rmSync(dir,{recursive:true,force:true});}
});
