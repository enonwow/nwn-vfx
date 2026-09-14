import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {execute,connection,health,downloadArtifact} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {smoothDeformationExample} from '../tests/fixtures/smooth-deformation.js';
import {BINARY_PROFILE_ID} from '../packages/core/src/export-profiles.js';
const out=resolve('output/releases/0.14.0');await mkdir(out,{recursive:true});
const call=async(operation:string,input:Record<string,unknown>={},key?:string)=>{const r=await execute(operation,input,{},key);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r;};
async function inventory(){const rows:any[]=[];let cursor:string|undefined;do{
  const data=(await call('projects.list',{limit:5,...(cursor?{cursor}:{})})).data as any;
  for(const p of data.items)rows.push({id:p.id,revision:p.revision,sha256:hash(canonical(p.document))});cursor=data.nextCursor??undefined;
}while(cursor);return rows;}
if(process.argv.includes('--before')){
  const projects=await inventory(),active:any[]=[];
  for(const p of projects){let cursor:string|undefined;do{
    const data=(await call('jobs.list',{projectId:p.id,limit:100,...(cursor?{cursor}:{})})).data as any;
    active.push(...data.items.filter((j:any)=>['queued','running','cancelling'].includes(j.status)).map((j:any)=>({id:j.id,projectId:p.id,status:j.status})));cursor=data.nextCursor??undefined;
  }while(cursor);}
  assert.equal(active.length,0,'Wait for existing jobs before service upgrade');
  const service=await health(await connection({}));await writeFile(join(out,'before-install.json'),JSON.stringify({service,projects,activeJobs:active},null,2));
  console.log(JSON.stringify({projects:projects.length,activeJobs:0,version:service.version}));
}else{
  const before=JSON.parse(await readFile(join(out,'before-install.json'),'utf8')),after=await inventory(),service=await health(await connection({}));
  assert.equal(service.version,'0.14.0');assert.equal(service.instanceId,before.service.instanceId);assert.equal(service.workspaceId,before.service.workspaceId);
  for(const p of before.projects)assert.deepEqual(after.find(a=>a.id===p.id),p);
  const caps=(await call('capabilities')).data as any;assert(caps.meshShading.vertexDeformation);assert.equal(caps.meshShading.exportedAnimatedNormals,false);
  const fixture=smoothDeformationExample(),document=structuredClone(fixture.document);delete document.layers[0].shading;
  const project=(await call('projects.import',{projectId:'studio-smooth-deformation-0140-proof',document},'smooth-0140-proof-import-v1')).data as any;
  const input={projectId:project.id,expectedRevision:project.revision,changes:[{type:'layer.set',layerId:fixture.layer.id,values:{shading:'smooth'}}]};
  const preview=(await call('changes.preview',input)).data as any;
  const committed=await call('changes.apply',input,'smooth-0140-proof-apply-v1'),saved=committed.data as any;
  assert.equal(saved.revision,2);assert.deepEqual(saved.document.layers,fixture.document.layers);
  const jobs:any[]=[];
  for(const [name,operation,extra] of [['png','preview.request',{time:.5,format:'png',camera:fixture.camera}],['binary','candidate.build',{profileId:BINARY_PROFILE_ID}]] as const){
    const accepted=(await call(operation,{projectId:project.id,revision:2,...extra},`smooth-0140-proof-${name}-v1`)).data as any;
    const deadline=Date.now()+120_000;let job:any;
    do{job=(await call('jobs.get',{jobId:accepted.id})).data;if(['succeeded','failed','cancelled'].includes(job.status))break;assert(Date.now()<deadline,'Acceptance job timed out');await delay(1000);}while(true);
    assert.equal(job.status,'succeeded',JSON.stringify(job.error));jobs.push({name,id:job.id,revision:job.revision,metadata:job.metadata});
    for(const artifact of job.artifacts.filter((a:any)=>['preview.png','validation.json','handoff.json'].includes(a.name)||a.name.endsWith('.zip')))
      await downloadArtifact(artifact,join(out,`${name}-${artifact.name}`),false,{});
  }
  assert.deepEqual(jobs[0].metadata.meshShading[0].deformationNormals,jobs[1].metadata.validation.readback.meshes[0].shading.deformationNormals);
  assert.equal(jobs[1].metadata.validation.compilation.normalReadback.animmeshNodes,2);
  const result={passed:true,service,projectId:project.id,revision:2,operationId:committed.operationId,preview,capabilities:caps.meshShading,
    jobs,userProjectsPreserved:before.projects.length,nativeVerified:false};
  await writeFile(join(out,'installed-proof.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({version:service.version,instanceId:service.instanceId,workspaceId:service.workspaceId,projectId:project.id,revision:2,userProjectsPreserved:before.projects.length,jobs:jobs.map(j=>({name:j.name,id:j.id}))}));
}
