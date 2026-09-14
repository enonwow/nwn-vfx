import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]),label=process.argv[3];
if(!['before','after'].includes(label))throw Error('Expected before/after');
const runtime=process.argv[4],cli=join(root,runtime,'bin/nwn-vfx.mjs'),configPath=join(root,'data/config.json'),configBytes=await readFile(configPath),config=JSON.parse(configBytes.toString()),run=promisify(execFile);
const call=async(args:string[])=>{const r=JSON.parse((await run(process.execPath,[cli,'--config',configPath,'--json',...args],{maxBuffer:32*1024*1024})).stdout);if(r.status==='failed')throw Error(JSON.stringify(r.error));return r.data;};
const all=async(args:string[])=>{let cursor:string|undefined,items:any[]=[];do{const page=await call([...args,'--limit','100',...(cursor?['--cursor',cursor]:[])]);items.push(...page.items);cursor=page.nextCursor;}while(cursor);return items;};
const projects=await all(['projects','list']),state:any[]=[];
for(const p of projects){
  const jobs=await all(['jobs','list','--project',p.id]);
  if(jobs.some((j:any)=>['queued','running','cancelling','blocked'].includes(j.status)))throw Error('Active jobs; deployment must wait');
  const reportsInput=join(root,'inputs','snapshot-reports.json');await writeFile(reportsInput,JSON.stringify({projectId:p.id}));
  const reports=await call(['reports','list','--input-file',reportsInput]);
  state.push({project:await call(['projects','inspect','--project',p.id]),jobs:jobs.sort((a:any,b:any)=>a.id.localeCompare(b.id)),reports:reports.detail.items.sort((a:any,b:any)=>a.id.localeCompare(b.id))});
}
state.sort((a,b)=>a.project.id.localeCompare(b.project.id));
const result={instanceId:config.instanceId,workspaceId:config.workspaceId,credentialFileSha256:createHash('sha256').update(await readFile(join(root,'tlc-agent.config.json'))).digest('hex'),state};
const file=join(root,`deployment-${label}.json`);await writeFile(file,JSON.stringify(result,null,2));
if(label==='after'){const before=JSON.parse(await readFile(join(root,'deployment-before.json'),'utf8'));if(JSON.stringify(before)!==JSON.stringify(result))throw Error('Public project/job/report state changed across deployment');}
console.log(JSON.stringify({label,projects:state.length,jobs:state.reduce((n,p)=>n+p.jobs.length,0),reports:state.reduce((n,p)=>n+p.reports.length,0),sameState:label==='after',instanceId:result.instanceId,workspaceId:result.workspaceId}));
