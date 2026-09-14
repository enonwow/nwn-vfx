import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execute,connection,health} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
const version=JSON.parse(await readFile('package.json','utf8')).version,out=resolve('output/releases',version);await mkdir(out,{recursive:true});
const run=promisify(execFile),installedCli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs');
const call=async(operation:string,input:Record<string,unknown>={})=>{
  // Use the installed client before upgrading: an older server may not know a future schema header.
  const args=['--json',...operation.split('.'),...Object.entries(input).flatMap(([k,v])=>['--'+(k==='projectId'?'project':k),String(v)])];
  const response=await run(process.execPath,[installedCli,...args],{windowsHide:true,maxBuffer:24*1024*1024});const r=JSON.parse(response.stdout);assert.equal(r.status,'ok',JSON.stringify(r.error));return r.data as any;
};
const projects:any[]=[];let cursor:string|undefined;
do{const d=await call('projects.list',{limit:5,...(cursor?{cursor}:{})});for(const p of d.items)projects.push({id:p.id,revision:p.revision,sha256:hash(canonical(p.document))});cursor=d.nextCursor??undefined;}while(cursor);
const service=await health(await connection({}));
if(process.argv.includes('--before')){
  const activeJobs:any[]=[];
  for(const p of projects){let cursor:string|undefined;do{
    const d=await call('jobs.list',{projectId:p.id,limit:100,...(cursor?{cursor}:{})});
    activeJobs.push(...d.items.filter((j:any)=>['queued','running','cancelling'].includes(j.status)).map((j:any)=>({id:j.id,projectId:p.id,status:j.status})));cursor=d.nextCursor??undefined;
  }while(cursor);}
  assert.equal(activeJobs.length,0,'Active jobs; defer update');
  await writeFile(join(out,'before-install.json'),JSON.stringify({service,projects,activeJobs},null,2));console.log(JSON.stringify({version:service.version,projects:projects.length,activeJobs:0}));
}else{
  const before=JSON.parse(await readFile(join(out,'before-install.json'),'utf8'));assert.equal(service.version,version);
  assert.equal(service.instanceId,before.service.instanceId);assert.equal(service.workspaceId,before.service.workspaceId);
  for(const p of before.projects)assert.deepEqual(projects.find(x=>x.id===p.id),p);
  const proof={service,projectsPreserved:before.projects.length,passed:true};await writeFile(join(out,'installed-preservation.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}
