/** One exact-document candidate through the installed public service. No native integration. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {execute,downloadArtifact,health,connection} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {BINARY_PROFILE_ID} from '../packages/core/src/export-profiles.js';

const projectId='tlc-wampir-bijace-serce', revision=4;
const expectedSha='5675ce09546c078f6d1aa0359b0b61a3c4f9dbace033f54c4d88e9ed254ba5bf';
const target='studio-heart-texture-origin-0142', modelName='vh_tex0142';
const out=resolve('output/texture-orientation-audit'),dir=join(out,'bottom-first-0142');await mkdir(dir,{recursive:true});
const call=async(operation:string,input:Record<string,unknown>,key?:string)=>{
  const r=await execute(operation,input,{},key);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data as any;
};
const service=await health(await connection({}));assert.equal(service.version,'0.14.2');
const original=await call('projects.inspect',{projectId,revision}),latestBefore=await call('projects.inspect',{projectId});
assert.equal(hash(canonical(original.document)),expectedSha);
const immutable=JSON.parse(await readFile('C:/Projects/the last city/assets/vfx/wampir/bijace-serce/export/r4/candidate/effect-document.json','utf8'));
assert.equal(hash(canonical(immutable)),expectedSha);
const fork=await call('projects.fork',{projectId,revision,newProjectId:target,name:original.document.name},'heart-texture-origin-fork-0142-v1');
assert.equal(fork.revision,1);assert.equal(hash(canonical(fork.document)),expectedSha);
await writeFile(join(dir,'source-document.json'),JSON.stringify(fork.document,null,2)+'\n');
const accepted=await call('candidate.build',{projectId:target,revision:1,profileId:BINARY_PROFILE_ID,modelName},'heart-texture-origin-build-0142-v1');
const deadline=Date.now()+180000;let job:any;
do{
  job=await call('jobs.get',{jobId:accepted.id});
  if(['succeeded','failed','cancelled'].includes(job.status))break;
  assert(Date.now()<deadline,'Timed out: recover this job with its original key');await delay(1000);
}while(true);
assert.equal(job.status,'succeeded',JSON.stringify(job.error));
for(const a of job.artifacts)if(a.name.endsWith('.zip')||a.name===`${modelName}.mdl`||['validation.json','handoff.json'].includes(a.name))
  await downloadArtifact(a,join(dir,a.name),true,{});
const latestAfter=await call('projects.inspect',{projectId});
assert.equal(latestAfter.revision,latestBefore.revision);
assert.equal(hash(canonical(latestAfter.document)),hash(canonical(latestBefore.document)));
assert.equal(hash(canonical((await call('projects.inspect',{projectId,revision})).document)),expectedSha);
const receipt={service,source:{projectId,revision,snapshotSha256:expectedSha},candidate:{projectId:target,revision:1,modelName,
  jobId:job.id,snapshotSha256:expectedSha,artifacts:job.artifacts,directory:dir},
  originalProjectPreserved:true,nativeVerified:false};
await writeFile(join(out,'candidate-handoff.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({projectId:target,revision:1,modelName,jobId:job.id,snapshotSha256:expectedSha,
  artifacts:job.artifacts.filter((a:any)=>a.name.endsWith('.zip')||a.name===`${modelName}.mdl`),nativeVerified:false}));
