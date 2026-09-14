import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=resolve(import.meta.dirname,'..'),out=join(root,'output/beam-authoring-lab/2026-09-10-param6');
const proof=JSON.parse(await readFile(join(out,'acceptance.json'),'utf8')),receipt=join(out,'wisp-lab.json'),run=promisify(execFile);
assert(!await access(receipt).then(()=>true,()=>false),'Already handed off; preserve author edits');
const env={...process.env};delete env.NWN_VFX_TOKEN;delete env.NWN_VFX_WORKSPACE;
let serial=0;
async function call(operation:string,input:object,key?:string){
  const path=join(out,'wisp-request-'+(++serial)+'.json');await writeFile(path,JSON.stringify(input));
  const {stdout}=await run(process.execPath,[proof.cli,'--json','--config',proof.configPath,'--endpoint',proof.endpoint,'operations','call',operation,'--input-file',path,...(key?['--idempotency-key',key]:[])],{cwd:'C:/Projects/the last city',env,windowsHide:true,maxBuffer:24*1024*1024});
  const result=JSON.parse(stdout);assert.notEqual(result.status,'failed',JSON.stringify(result.error));return result.data;
}
const source=JSON.parse(await readFile(join(root,'output/beam-animation-correction/effect-document.json'),'utf8'));
const fork=await call('projects.fork',{projectId:proof.lab.projectId,revision:1,newProjectId:'tlc-beam-wisp-lab',name:'The Last City - isolated wisp authoring'},'tlc-beam-wisp-lab-fork-001');
const layer=source.layers[0],fields=['texture','color','midColor','endColor','alpha','midAlpha','endAlpha','size','midSize','endSize'];
const project=await call('changes.apply',{projectId:fork.id,expectedRevision:fork.revision,changes:[{type:'layer.set',layerId:layer.id,values:Object.fromEntries(fields.map(f=>[f,layer[f]]))}]},'tlc-beam-wisp-lab-appearance-001');
assert.deepEqual(project.document.layers,source.layers);
for(const asset of source.assets)assert.deepEqual(project.document.assets.find((a:any)=>a.id===asset.id),asset);
const result={projectId:project.id,initialRevision:project.revision,source:'V10-derived lab fork; appearance restored from immutable V9 source through public changes.apply',
  sourceLayersIdentical:true,sourceAssetsPreserved:true,originalsUnchanged:true,actorId:proof.actor.id,cli:proof.cli,configPath:proof.configPath,endpoint:proof.endpoint};
await writeFile(receipt,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
