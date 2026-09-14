import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {connection,health,downloadArtifact} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {flipbookFixture,atlasSettings} from '../tests/fixtures/flipbook.js';

const before=process.argv.includes('--before'),preinstall=process.argv.includes('--preinstall'),close=process.argv.includes('--close');
const out=resolve('output/releases/0.20.0');await mkdir(out,{recursive:true});
const conn=await connection({}),service=await health(conn),projectId='studio-flipbook-0200';
const call=async(operation:string,input:object={},key?:string)=>{
  const r=await fetch(conn.endpoint+'/api/commands',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+conn.token,'x-nwn-vfx-document-schema':service.version==='0.19.0'?'11':'12'},body:JSON.stringify({operation,input,...(key?{idempotencyKey:key}:{})})}).then(r=>r.json());assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;
};
async function pages(operation:string,input:object={}){const items:any[]=[];let cursor:string|undefined;do{const p=await call(operation,{...input,limit:100,...(cursor?{cursor}:{})});items.push(...p.items);cursor=p.nextCursor??undefined;}while(cursor);return items;}
async function wait(id:string){const deadline=Date.now()+120000;for(;;){const j=await call('jobs.get',{jobId:id});if(j.status==='succeeded')return j;assert(!['failed','cancelled'].includes(j.status),JSON.stringify(j.error));assert(Date.now()<deadline);await delay(200);}}
async function build(revision:number,label:string){const j=await wait((await call('candidate.build',{projectId,revision,modelName:'atlas_0200'},`atlas-0200-${label}-v1`)).id);return {id:j.id,resources:j.artifacts.filter((a:any)=>/\.(mdl|tga|txi|wav)$/.test(a.name)).map((a:any)=>({name:a.name,sha256:a.sha256,size:a.size})),metadata:j.metadata};}
async function preview(revision:number,label:string){const j=await wait((await call('preview.request',{projectId,revision,time:.75,format:'png'},`atlas-0200-preview-${label}-v1`)).id),png=j.artifacts.find((a:any)=>a.name.endsWith('.png'));await downloadArtifact(png,join(out,`${label}.png`),true,{});return {id:j.id,pngSha256:png.sha256,metadata:j.metadata};}
if(before){
  assert.equal(service.version,'0.19.0');const projects=await pages('projects.list');
  const p=await call('projects.import',{projectId,document:flipbookFixture(false)},'atlas-0200-fixture-v1');
  const baseline={service,projects:projects.map(p=>({id:p.id,revision:p.revision,sha256:hash(canonical(p.document))})),fixture:p,build:await build(p.revision,'legacy-before'),preview:await preview(p.revision,'legacy-before')};
  await writeFile(join(out,'baseline.json'),JSON.stringify(baseline,null,2));console.log(JSON.stringify({passed:true,baselineProjects:projects.length,fixture:p.id,revision:p.revision}));
}else if(preinstall){
  const projects=await pages('projects.list');for(const p of projects)assert(!(await pages('jobs.list',{projectId:p.id})).some(j=>['queued','running','cancelling'].includes(j.status)),'Active jobs; defer installation');
  await writeFile(join(out,'preinstall.json'),JSON.stringify({service,projects:projects.map(p=>({id:p.id,revision:p.revision,sha256:hash(canonical(p.document))}))},null,2));console.log(JSON.stringify({passed:true,activeJobs:0,projects:projects.length}));
}else if(close){
  const previous=JSON.parse(await readFile(join(out,'preinstall.json'),'utf8')),projects=await pages('projects.list'),preserved=[],advanced=[];
  for(const old of previous.projects.filter((p:any)=>p.id!==projectId)){
    const now=projects.find(p=>p.id===old.id);assert(now,'Missing project '+old.id);
    const snapshot=now.revision===old.revision?now:await call('projects.inspect',{projectId:old.id,revision:old.revision});assert.equal(hash(canonical(snapshot.document)),old.sha256);
    (now.revision===old.revision?preserved:advanced).push({id:old.id,oldRevision:old.revision,currentRevision:now.revision});
  }
  await writeFile(join(out,'closure.json'),JSON.stringify({passed:true,service,preserved,advancedExternally:advanced},null,2));console.log(JSON.stringify({passed:true,preserved:preserved.length,advancedExternally:advanced}));
}else{
  assert.equal(service.version,'0.20.0');const baseline=JSON.parse(await readFile(join(out,'baseline.json'),'utf8'));
  const legacy=await build(baseline.fixture.revision,'legacy-after');assert.deepEqual(legacy.resources,baseline.build.resources);
  const legacyPreview=await preview(baseline.fixture.revision,'legacy-after');assert.equal(legacyPreview.pngSha256,baseline.preview.pngSha256,'Historical static rendering remains byte-exact');
  const input={projectId,expectedRevision:baseline.fixture.revision,changes:[{type:'layer.set',layerId:'atlas',values:{flipbook:atlasSettings}}]};
  const inputPath=join(out,'cli-input.json');await writeFile(inputPath,JSON.stringify(input));
  const cli='C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs';
  const result=JSON.parse(execFileSync(process.execPath,[cli,'--json','operations','call','changes.apply','--input-file',inputPath,'--idempotency-key','atlas-0200-installed-cli-v1'],{cwd:'C:/Projects/the last city',windowsHide:true,encoding:'utf8'}));
  assert.notEqual(result.status,'failed',JSON.stringify(result.error));const p=result.data;assert.equal(p.document.schemaVersion,12);assert.deepEqual(p.document.layers[0].flipbook,atlasSettings);
  const candidate=await build(p.revision,'animated'),render=await preview(p.revision,'animated');assert.notEqual(render.pngSha256,legacyPreview.pngSha256);
  await writeFile(join(out,'installed-cli.json'),JSON.stringify({passed:true,service,projectId,revision:p.revision,legacy,legacyPreview,candidate,render},null,2));console.log(JSON.stringify({passed:true,version:service.version,projectId,revision:p.revision}));
}
