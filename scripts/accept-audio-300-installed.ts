import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {execute,connection,health} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
const out=resolve('output/releases/0.17.0');await mkdir(out,{recursive:true});
const service=await health(await connection({}));assert.equal(service.version,'0.17.0');
const call=async(operation:string,input:Record<string,unknown>,key?:string)=>{
  const r=await execute(operation,input,{},key);assert.equal(r.status,'ok',JSON.stringify(r.error));return r;
};
const sourceId='studio-amplification-0160',sourceRevision=2;
const result=await call('projects.fork',{projectId:sourceId,revision:sourceRevision,newProjectId:'studio-amplification-0170',name:'TEST — Wzmocnienie 300% — 0.17.0'},'studio-amplification-0170-fork-v1');
const project=result.data as any,clip=project.document.audioClips[0];assert.equal(clip.gain,1.5);
const patchPath=join(out,'gain-300.json');await writeFile(patchPath,JSON.stringify([{type:'audio.set',clipId:clip.id,values:{gain:3}}],null,2)+'\n');
const cliPath='C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs';
const foreignCwd='C:/Projects/the last city';
const cliPreview=JSON.parse(execFileSync(process.execPath,[cliPath,'--json','changes','preview','--project',project.id,'--expected-revision',String(project.revision),'--input-file',patchPath],{cwd:foreignCwd,encoding:'utf8',windowsHide:true}));
assert.equal(cliPreview.status,'ok');assert.equal(cliPreview.data.document.audioClips[0].gain,3);assert.equal(cliPreview.diagnostics[0].audio.limiter,false);
const cliApplied=JSON.parse(execFileSync(process.execPath,[cliPath,'--json','changes','apply','--project',project.id,'--expected-revision',String(project.revision),'--input-file',patchPath,'--idempotency-key','studio-0170-cli-300-v1'],{cwd:foreignCwd,encoding:'utf8',windowsHide:true}));
assert.equal(cliApplied.status,'ok');assert.equal(cliApplied.data.document.audioClips[0].gain,3);assert.equal(hash(canonical(cliApplied.data.document.audioAssets)),hash(canonical(project.document.audioAssets)));
await writeFile(join(out,'cli-apply.json'),JSON.stringify({projectId:project.id,revision:cliApplied.data.revision,gain:3,sourceUnchanged:true,diagnostics:cliApplied.diagnostics},null,2)+'\n');
await writeFile(join(out,'cli-preview.json'),JSON.stringify({cwd:foreignCwd,projectId:project.id,revision:project.revision,gain:3,diagnostics:cliPreview.diagnostics},null,2)+'\n');
const consumerPreviews=[];
for(const id of ['tlc-wampir-ugryzienie','tlc-wampir-bijace-serce']){
  const before=(await call('projects.inspect',{projectId:id})).data as any;
  const changes=before.document.audioClips.map((c:any)=>({type:'audio.set',clipId:c.id,values:{gain:c.gain*2}}));
  const preview=await call('changes.preview',{projectId:id,expectedRevision:before.revision,changes});
  const after=(await call('projects.inspect',{projectId:id})).data as any;
  assert.equal(after.revision,before.revision);assert.equal(hash(canonical(after.document)),hash(canonical(before.document)));
  consumerPreviews.push({projectId:id,revision:before.revision,documentSha256:hash(canonical(before.document)),changes,diagnostics:preview.diagnostics,unchanged:true});
}
await writeFile(join(out,'consumer-gain-preview.json'),JSON.stringify(consumerPreviews,null,2)+'\n');
const proof={service,projectId:project.id,revision:cliApplied.data.revision,clipId:clip.id,sourceId,sourceRevision,sourceAudioHash:hash(canonical(project.document.audioAssets)),sourceGain:clip.gain,foreignCliPassed:true};
await writeFile(join(out,'fixture.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
console.log(JSON.stringify(consumerPreviews));
