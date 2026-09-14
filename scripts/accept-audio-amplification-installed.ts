import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {execute,connection,health} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
const out=resolve('output/releases/0.16.0');await mkdir(out,{recursive:true});
const service=await health(await connection({}));assert.equal(service.version,'0.16.0');
const call=async(operation:string,input:Record<string,unknown>,key?:string)=>{
  const r=await execute(operation,input,{},key);assert.equal(r.status,'ok',JSON.stringify(r.error));return r;
};
const sourceId='3bd62c64-9803-41b2-8334-d43c1b9a4706',sourceRevision=8;
const result=await call('projects.fork',{projectId:sourceId,revision:sourceRevision,newProjectId:'studio-amplification-0160',name:'TEST — Wzmocnienie 150% — 0.16.0'},'studio-amplification-0160-fork-v1');
const project=result.data as any,clip=project.document.audioClips[0];assert.equal(clip.gain,1);
const patchPath=join(out,'gain-150.json');await writeFile(patchPath,JSON.stringify([{type:'audio.set',clipId:clip.id,values:{gain:1.5}}],null,2)+'\n');
const cliPath='C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs';
const foreignCwd='C:/Projects/the last city';
const cliPreview=JSON.parse(execFileSync(process.execPath,[cliPath,'--json','changes','preview','--project',project.id,'--expected-revision',String(project.revision),'--input-file',patchPath],{cwd:foreignCwd,encoding:'utf8',windowsHide:true}));
assert.equal(cliPreview.status,'ok');assert.equal(cliPreview.data.document.audioClips[0].gain,1.5);assert.equal(cliPreview.diagnostics[0].audio.limiter,false);
await writeFile(join(out,'cli-preview.json'),JSON.stringify({cwd:foreignCwd,projectId:project.id,revision:project.revision,gain:1.5,diagnostics:cliPreview.diagnostics},null,2)+'\n');
const consumerPreviews=[];
for(const id of ['tlc-wampir-ugryzienie','tlc-wampir-bijace-serce']){
  const before=(await call('projects.inspect',{projectId:id})).data as any;
  const changes=before.document.audioClips.map((c:any)=>({type:'audio.set',clipId:c.id,values:{gain:c.gain*1.5}}));
  const preview=await call('changes.preview',{projectId:id,expectedRevision:before.revision,changes});
  const after=(await call('projects.inspect',{projectId:id})).data as any;
  assert.equal(after.revision,before.revision);assert.equal(hash(canonical(after.document)),hash(canonical(before.document)));
  consumerPreviews.push({projectId:id,revision:before.revision,documentSha256:hash(canonical(before.document)),changes,diagnostics:preview.diagnostics,unchanged:true});
}
await writeFile(join(out,'consumer-gain-preview.json'),JSON.stringify(consumerPreviews,null,2)+'\n');
const proof={service,projectId:project.id,revision:project.revision,clipId:clip.id,sourceId,sourceRevision,sourceAudioHash:hash(canonical(project.document.audioAssets)),sourceGain:clip.gain,foreignCliPassed:true};
await writeFile(join(out,'fixture.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
console.log(JSON.stringify(consumerPreviews));
