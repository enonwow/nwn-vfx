import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {connection,health,downloadArtifact} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {audioFixture} from '../tests/fixtures/audio.js';
const preinstall=process.argv.includes('--preinstall'),before=process.argv.includes('--before')||preinstall,close=process.argv.includes('--close');
const cli='C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs',cwd='C:/Projects/the last city';
const out=resolve('output/releases/0.19.0');await mkdir(out,{recursive:true});
const conn=await connection({}),service=await health(conn);assert.equal(service.version,before?'0.18.0':'0.19.0');
const call=async(operation:string,input:object={},key?:string)=>{
  const r=await fetch(conn.endpoint+'/api/commands',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+conn.token,'x-nwn-vfx-document-schema':before?'10':'11'},body:JSON.stringify({operation,input,...(key?{idempotencyKey:key}:{})})}).then(r=>r.json());
  assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r;
};
async function pages(operation:string,input:object){const items:any[]=[];let cursor:string|undefined;do{const p=(await call(operation,{...input,limit:100,...(cursor?{cursor}:{})})).data;items.push(...p.items);cursor=p.nextCursor??undefined;}while(cursor);return items;}
async function consumerState(){
  const states=[];
  for(const [projectId,revision] of [['tlc-wampir-ugryzienie',31],['tlc-wampir-bijace-serce',9]] as const){
    const p=(await call('projects.inspect',{projectId})).data;assert.equal(p.revision,revision);assert(p.document.audioClips.every((c:any)=>c.gain===3));
    states.push({projectId,revision,sha256:hash(canonical(p.document)),audioAssetsSha256:hash(canonical(p.document.audioAssets)),
      revisionsSha256:hash(canonical(await pages('revisions.list',{projectId}))),artifacts:(await pages('artifacts.list',{projectId})).map(a=>({id:a.id,sha256:a.sha256,size:a.size})).sort((a,b)=>a.id.localeCompare(b.id))});
  }return states;
}
async function build(revision:number,label:string){
  const accepted=before?await call('candidate.build',{projectId:'studio-orient-0190',revision,modelName:'orient_0190'},`orient-0190-${label}-v1`)
    :JSON.parse(execFileSync(process.execPath,[cli,'--json','candidate','build','--project','studio-orient-0190','--revision',String(revision),'--model-name','orient_0190','--idempotency-key',`orient-0190-${label}-v1`],{cwd,encoding:'utf8',windowsHide:true}));
  assert.equal(accepted.status,'accepted',JSON.stringify(accepted.error));const jobId=accepted.data.id;
  const deadline=Date.now()+120000;let job:any;do{job=(await call('jobs.get',{jobId})).data;if(['succeeded','failed'].includes(job.status))break;assert(Date.now()<deadline);await delay(250);}while(true);
  assert.equal(job.status,'succeeded',JSON.stringify(job.error));
  const resources=job.artifacts.filter((a:any)=>/\.(mdl|tga|txi|wav)$/.test(a.name)).map((a:any)=>({name:a.name,sha256:a.sha256,size:a.size})).sort((a:any,b:any)=>a.name.localeCompare(b.name));
  if(!before){
    for(const name of ['vfx-integration.json','validation.json','handoff.json'])await downloadArtifact(job.artifacts.find((a:any)=>a.name===name),join(out,`${label}-${name}`),true,{});
    const effect=JSON.parse(await readFile(join(out,`${label}-vfx-integration.json`),'utf8'));
    assert.equal(effect.revision,revision);assert.equal(effect.projectId,'studio-orient-0190');
    assert.equal(effect.model.resref,'orient_0190');assert.equal(effect.model.sha256,resources.find((a:any)=>a.name==='orient_0190.mdl').sha256);
    assert.deepEqual(effect,job.metadata.validation.integration.effect);
  }
  return {jobId,resources,metadata:job.metadata};
}
const baselinePath=join(out,'baseline.json'),baseline=before?null:JSON.parse(await readFile(baselinePath,'utf8'));
const consumer=await consumerState();if(baseline)assert.deepEqual(consumer,baseline.consumer);
if(preinstall){
  const saved=JSON.parse(await readFile(baselinePath,'utf8'));assert.deepEqual(consumer,saved.consumer);
  const projects=await pages('projects.list',{});
  for(const p of projects)assert(!(await pages('jobs.list',{projectId:p.id})).some(j=>['queued','running','cancelling'].includes(j.status)),'Active jobs; defer installation');
  console.log(JSON.stringify({preinstall:true,passed:true,activeJobs:0,projects:projects.length}));
}else if(close){
  const projects=(await pages('projects.list',{})).map(p=>({id:p.id,revision:p.revision,sha256:hash(canonical(p.document))}));
  for(const p of baseline.projects.filter((p:any)=>p.id!=='studio-orient-0190'))assert.deepEqual(projects.find(x=>x.id===p.id),p);
  const installedRoot='C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio',installedFiles=[];
  for(const path of ['docs/agents/effect-integration.md','docs/agents/webmcp.md','skills/nwn-vfx/SKILL.md','README.md']){
    const source=await readFile(path),installed=await readFile(join(installedRoot,path));assert.equal(hash(source),hash(installed));installedFiles.push({path,sha256:hash(source)});
  }
  assert.equal(hash(await readFile('skills/nwn-vfx/SKILL.md')),hash(await readFile('C:/Users/enonw/.codex/skills/nwn-vfx/SKILL.md')));
  const host=JSON.parse(await readFile(join(out,'real-host-webmcp.json'),'utf8'));assert.equal(host.passed,true);assert.equal(host.toolCount,48);
  await writeFile(join(out,'closure.json'),JSON.stringify({passed:true,service,consumer,otherPreexistingProjectsPreserved:baseline.projects.length-1,installedFiles,personalSkillMatches:true,nativeVerified:false},null,2)+'\n');console.log(JSON.stringify({passed:true,productionRevisions:[31,9],otherPreexistingProjectsPreserved:baseline.projects.length-1}));
}else if(before){
  const f=audioFixture(true);const document={...f.document,name:'TEST — Obracaj z postacią — 0.19.0',audioClips:[{...f.clip,gain:3}]};
  const p=(await call('projects.import',{projectId:'studio-orient-0190',document},'studio-orient-0190-fixture-v1')).data;assert.equal(p.revision,1);
  const candidate=await build(1,'before');
  const portable=(await call('projects.export',{projectId:p.id,revision:1},'studio-orient-0190-legacy-zip-v1')).data;
  await downloadArtifact(portable.artifact,join(out,'legacy.zip'),true,{});
  const projects=await pages('projects.list',{});for(const p of projects)assert(!(await pages('jobs.list',{projectId:p.id})).some(j=>['queued','running','cancelling'].includes(j.status)));
  await writeFile(baselinePath,JSON.stringify({service,consumer,document,candidate,projects:projects.map(p=>({id:p.id,revision:p.revision,sha256:hash(canonical(p.document))}))},null,2)+'\n');
  console.log(JSON.stringify({phase:'before',passed:true,projects:projects.length,fixture:p.id,resources:candidate.resources.length}));
}else{
  assert.equal(service.instanceId,baseline.service.instanceId);assert.equal(service.workspaceId,baseline.service.workspaceId);
  const projects=(await pages('projects.list',{})).map(p=>({id:p.id,revision:p.revision,sha256:hash(canonical(p.document))}));for(const p of baseline.projects)assert.deepEqual(projects.find(x=>x.id===p.id),p);
  const unchanged=await build(1,'legacy-after');assert.deepEqual(unchanged.resources,baseline.candidate.resources);
  const roundtrip=(await call('projects.import',{projectId:'studio-orient-legacy-roundtrip',bundleBase64:(await readFile(join(out,'legacy.zip'))).toString('base64')},'studio-orient-0190-legacy-import-v1')).data;assert.deepEqual(roundtrip.document,baseline.document);
  const results=[];
  for(const [value,revision] of [[true,1],[false,2]] as const){
    const path=join(out,`orient-${value}.json`);await writeFile(path,JSON.stringify([{type:'project.set',values:{orientWithObject:value}}])+'\n');
    const invoke=(verb:string)=>JSON.parse(execFileSync(process.execPath,[cli,'--json','changes',verb,'--project','studio-orient-0190','--expected-revision',String(revision),'--input-file',path,...(verb==='apply'?['--idempotency-key',`orient-0190-cli-${value}-v1`]:[])],{cwd,encoding:'utf8',windowsHide:true}));
    const preview=invoke('preview');assert.equal(preview.status,'ok');assert.equal(preview.data.document.orientWithObject,value);
    const applied=invoke('apply');assert.equal(applied.status,'ok');assert.equal(applied.data.document.orientWithObject,value);assert.equal(applied.data.document.schemaVersion,11);
    assert.deepEqual(applied.data.document.layers,baseline.document.layers);assert.deepEqual(applied.data.document.audioClips,baseline.document.audioClips);assert.deepEqual(applied.data.document.audioAssets,baseline.document.audioAssets);
    const built=await build(revision+1,String(value));assert.deepEqual(built.resources,baseline.candidate.resources);
    assert.deepEqual(built.metadata.validation.integration.effect.visualeffects2da,{rowId:null,columns:{OrientWithObject:value?1:0}});
    results.push({value,revision:applied.data.revision,operationId:applied.operationId,...built});
  }
  const portable=(await call('projects.export',{projectId:'studio-orient-0190',revision:3},'studio-orient-0190-zip-v6-v1')).data;
  await downloadArtifact(portable.artifact,join(out,'schema11.zip'),true,{});
  const imported=(await call('projects.import',{projectId:'studio-orient-v6-roundtrip',bundleBase64:(await readFile(join(out,'schema11.zip'))).toString('base64')},'studio-orient-0190-v6-import-v1')).data;
  assert.deepEqual(imported.document,(await call('projects.inspect',{projectId:'studio-orient-0190'})).data.document);
  assert.deepEqual(await consumerState(),consumer);
  await writeFile(join(out,'installed-cli.json'),JSON.stringify({passed:true,service,consumer,projectsPreserved:baseline.projects.length,cwd,unchanged,results,legacyZipExact:true,v6ZipExact:true,nativeVerified:false},null,2)+'\n');
  console.log(JSON.stringify({passed:true,projectsPreserved:baseline.projects.length,cli:true,resourcesIdentical:true,fixture:'studio-orient-0190',revision:3}));
}
