import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execute,connection,health} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {paletteFixture,paletteOptions} from '../tests/fixtures/palette.js';
const out=resolve('output/releases/0.13.0');await mkdir(out,{recursive:true});
const call=async(operation:string,input:Record<string,unknown>={},key?:string)=>{const r=await execute(operation,input,{},key);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r;};
async function inventory(){const rows:any[]=[];let cursor:string|undefined;do{
 const data=(await call('projects.list',{limit:10,...(cursor?{cursor}:{})})).data as any;
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
 assert.equal(service.version,'0.13.0');assert.equal(service.instanceId,before.service.instanceId);assert.equal(service.workspaceId,before.service.workspaceId);
 for(const p of before.projects)assert.deepEqual(after.find(a=>a.id===p.id),p);
 const caps=(await call('capabilities')).data as any;assert.equal(caps.palette.version,'oklch-hue-rotation-v1');
 const project=(await call('projects.import',{projectId:'studio-palette-0130-proof',document:{...paletteFixture(),name:'Paleta 0.13.0 — własny test'}},'palette-0130-proof-import-v1')).data as any;
 const input={projectId:project.id,expectedRevision:project.revision,options:paletteOptions};
 const preview=(await call('palette.preview',input)).data as any;
 const result=await call('palette.apply',{...input,proposalHash:preview.proposalHash},'palette-0130-proof-apply-v1'),saved=(result.data as any).project;
 assert.deepEqual(saved.document,preview.document);assert.equal(saved.revision,2);
 await writeFile(join(out,'installed-proof.json'),JSON.stringify({passed:true,service,projectId:project.id,revision:saved.revision,operationId:result.operationId,
  options:paletteOptions,proposalHash:preview.proposalHash,report:preview.report,userProjectsPreserved:before.projects.length,nativeVerified:false},null,2));
 console.log(JSON.stringify({version:service.version,instanceId:service.instanceId,workspaceId:service.workspaceId,projectId:project.id,revision:2,userProjectsPreserved:before.projects.length}));
}
