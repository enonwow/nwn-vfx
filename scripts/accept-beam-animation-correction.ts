import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createApp} from '../apps/service/src/app.js';
import {execute,downloadArtifact,connection,health} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {validateOperationOutput} from '../packages/contracts/src/schema.js';

// Re-export the existing isolated r1 using public HTTP operations. No import,
// source edit, native execution, or replacement of historical artifacts.
const previous=resolve('output/beam-flow-diagnostic'),out=resolve('output/beam-animation-correction');
const dataDir=join(previous,'isolated-service'),port=14384;
const options={config:join(dataDir,'config.json'),endpoint:`http://127.0.0.1:${port}`};
const projectId='studio-finite-essence-diagnostic',revision=1,oldJobId='6bbb48bb-68de-4298-ab4c-8cecc524283b';
const snapshotSha256='9b66d3aa119b2a88a48d65734d6666cf99af4de8726d25fd20442a0b15cb0731';
const modelSha256='62394c9c42822d5a9f13046582e110a6d69932a8a4d3ed64bfe4d5b49d50bf9f';
await mkdir(out,{recursive:true});
const app=await createApp({dataDir,port,webDir:resolve('dist/web')});
const call=async(operation:string,input:Record<string,unknown>={},key?:string)=>{
  const result=await execute(operation,input,options,key);
  assert.notEqual(result.status,'failed',JSON.stringify(result.error));
  validateOperationOutput(operation,result.data);
  return result.data as any;
};
try{
  await app.listen({host:'127.0.0.1',port});
  const service=await health(await connection(options));
  assert.equal(service.workspaceId,'956bb5be-f64b-415b-8a40-64917ecbee85');
  const before=await call('projects.inspect',{projectId});
  assert.equal(before.revision,revision);assert.equal(hash(canonical(before.document)),snapshotSha256);
  const oldJob=await call('jobs.get',{jobId:oldJobId}),oldEffect=oldJob.metadata.validation.integration.effect;
  assert.equal(oldEffect.schemaVersion,5);
  assert.deepEqual(oldEffect.beam.progfx2da.columns,{Type:7,Param1:'vd_essence01',Param2:'cast01'});
  const queued=await call('candidate.build',{projectId,revision,modelName:'vd_essence01',profileId:'nwn-ee-beam-binary-experimental-v1'},'finite-essence-diagnostic-binary-param6-v2');
  await app.studio.drainJobs();
  const job=await call('jobs.get',{jobId:queued.id});
  assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert.notEqual(job.id,oldJob.id);
  const artifacts=[];
  for(const artifact of job.artifacts){
    const path=join(out,artifact.fileName);
    // Idempotent acceptance reruns compare an existing download, never replace it.
    const existing=await readFile(path).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(existing===null)await downloadArtifact(artifact,path,false,options);
    const bytes=existing??await readFile(path);
    assert.equal(bytes.length,artifact.size);assert.equal(hash(bytes),artifact.sha256);
    artifacts.push({id:artifact.id,name:artifact.fileName,size:artifact.size,sha256:artifact.sha256,path});
  }
  const resources=artifacts.filter(a=>/\.(mdl|hak|tga|txi)$/.test(a.name));
  const oldResources=oldJob.artifacts.filter((a:any)=>/\.(mdl|hak|tga|txi)$/.test(a.fileName));
  assert.deepEqual(resources.map(a=>a.name).sort(),oldResources.map((a:any)=>a.fileName).sort());
  for(const resource of resources){
    const old=oldResources.find((a:any)=>a.fileName===resource.name);
    assert.equal(resource.sha256,old.sha256,resource.name+' hash must not change');
    assert.deepEqual(await readFile(resource.path),await readFile(join(previous,'binary',resource.name)),resource.name+' bytes must not change');
  }
  assert.equal(resources.find(a=>a.name==='vd_essence01.mdl')!.sha256,modelSha256);
  const effect=JSON.parse(await readFile(join(out,'vfx-integration.json'),'utf8'));
  assert.equal(effect.schemaVersion,6);
  assert.deepEqual(effect.beam.progfx2da.columns,{Type:7,Param1:'vd_essence01',Param6:'cast01'});
  const corrected=structuredClone(oldEffect);
  corrected.schemaVersion=6;delete corrected.beam.progfx2da.columns.Param2;corrected.beam.progfx2da.columns.Param6='cast01';
  assert.deepEqual(effect,corrected,'Only version and Type7 animation binding may change');
  const handoff=JSON.parse(await readFile(join(out,'handoff.json'),'utf8'));
  assert.deepEqual(handoff.metadata.validation.integration.effect,effect);
  assert.deepEqual(job.metadata.validation.integration.effect,effect);
  const after=await call('projects.inspect',{projectId});
  assert.equal(after.revision,revision);assert.equal(hash(canonical(after.document)),snapshotSha256);
  assert.deepEqual(await call('jobs.get',{jobId:oldJobId}),oldJob,'Historical job must remain immutable and readable');
  const report={passed:true,prerelease:true,nativeVerified:false,globalInstall:false,transport:'public CLI client / HTTP; closed output validation',
    service,project:{id:projectId,revision,snapshotSha256},previousJobId:oldJobId,jobId:job.id,
    previousIntegrationVersion:5,integrationVersion:6,columns:effect.beam.progfx2da.columns,
    onlyIntegrationChanges:['schemaVersion','beam.progfx2da.columns.Param2 -> Param6'],
    sourceUnchanged:true,historicalJobUnchanged:true,resourceBytesIdentical:resources.map(a=>a.name),artifacts};
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,jobId:job.id,projectId,revision,integrationVersion:6,modelSha256,identicalResources:resources.length,handoff:join(out,'handoff.json')}));
}finally{await app.close();}
