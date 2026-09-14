import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {canonical,hash} from '../apps/service/src/store.js';
const root=resolve(import.meta.dirname,'..'),out=join(root,'output/releases/0.25.0');await mkdir(out,{recursive:true});
const cli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs'),run=promisify(execFile),consumer='C:/Projects/the last city';
async function call(args:string[]){const r=await run(process.execPath,[cli,'--json',...args],{cwd:consumer,windowsHide:true,maxBuffer:32*1024*1024});const v=JSON.parse(r.stdout);assert.notEqual(v.status,'failed',JSON.stringify(v.error));return v.data;}
const report:any={version:'0.25.0',consumerCwd:consumer,nativeVerified:false,jobs:[]};
async function download(a:any,folder:string){await mkdir(folder,{recursive:true});const path=join(folder,a.fileName);await call(['artifacts','get',a.id,'--out',path,'--overwrite']);const b=await readFile(path);assert.equal(hash(b),a.sha256);assert.equal(b.length,a.size);return {name:a.fileName,sha256:a.sha256,bytes:b.length,artifactId:a.id,path};}
async function job(args:string[],folder:string){const q=await call(args),j=await call(['jobs','wait',q.id,'--timeout','60s']);assert.equal(j.status,'succeeded',JSON.stringify(j.error));const files=[];for(const a of j.artifacts)files.push(await download(a,folder));const row={id:j.id,projectId:j.projectId,revision:j.revision,metadata:j.metadata,files};report.jobs.push(row);console.log(JSON.stringify({job:j.id,files:files.length}));await writeFile(join(out,'installed-progress.json'),JSON.stringify(report,null,2));return row;}
report.doctor=await call(['doctor']);report.capabilities=await call(['capabilities']);assert.equal(report.capabilities.beamAuthoring.minimumStudioVersion,'0.25.0');assert(report.capabilities.documentSchemaVersions.includes(16));
// Read-only source use of this task's own historical technical fixtures.
const baseline=JSON.parse(await readFile(join(root,'output/releases/0.24.0/installed-acceptance.json'),'utf8'));
for(const [name,index] of [['fnf',0],['duration',1]] as const){
  const old=baseline.jobs[index],row=await job(['candidate','build','--project',old.projectId,'--revision',String(old.revision),'--model-name','duration_audio','--idempotency-key',`beam-0250-${name}-preservation`],join(out,name+'-preserved'));
  const resources=(files:any[])=>files.filter(f=>/\.(mdl|hak|tga|txi|wav|nss)$/.test(f.name)||f.name==='audio-events.json').map(f=>({name:f.name,sha256:f.sha256})).sort((a,b)=>a.name.localeCompare(b.name));
  assert.deepEqual(resources(row.files),resources(old.files));report[name+'ResourcesPreserved']=resources(row.files);
}
let p=await call(['projects','create','--project','studio-beam-0250-cli','--name','Technical custom beam CLI','--preset','empty','--lifecycle','beam','--idempotency-key','beam-0250-cli-create']);
p=(await call(['assets','import','--project',p.id,'--expected-revision',String(p.revision),'--file',join(root,'docs/agents/examples/deformation/red-surface.png'),'--idempotency-key','beam-0250-cli-texture'])).project;
const changes=[{type:'layer.set',layerId:'beam',values:{texture:'asset:'+p.document.assets[0].id,width:.04,alpha:1,color:'#e53045',target:[0,5,1.2],radius:.05,flow:{direction:'target-to-source',speed:2}}}];
const input=join(out,'cli-changes.json');await writeFile(input,JSON.stringify(changes,null,2));const edit=['--project',p.id,'--expected-revision',String(p.revision),'--input-file',input];await call(['changes','preview',...edit]);p=await call(['changes','apply',...edit,'--idempotency-key','beam-0250-cli-edit']);assert.equal(p.document.schemaVersion,16);
report.project={id:p.id,revision:p.revision,snapshotSha256:hash(canonical(p.document))};const base=['--project',p.id,'--revision',String(p.revision)];
await writeFile(join(out,'cli-project.json'),JSON.stringify(p,null,2));
await download((await call(['projects','export',...base,'--idempotency-key','beam-0250-cli-zip'])).artifact,out);
for(const format of ['ascii','binary'])await job(['candidate','build',...base,'--model-name','custom_beam','--profile',`nwn-ee-beam-${format}-experimental-v1`,'--idempotency-key',`beam-0250-cli-${format}`],join(out,format));
await job(['preview','request',...base,'--format','png','--time','0.8','--idempotency-key','beam-0250-cli-png'],join(out,'png'));
const video=await job(['preview','request',...base,'--format','webm','--cycles','2','--idempotency-key','beam-0250-cli-webm'],join(out,'video'));
assert.equal(video.metadata.previewWindowSeconds,3);assert.equal(video.metadata.duration,6);assert.equal(video.metadata.loopSeconds,undefined);
const beam=JSON.parse(await readFile(join(out,'binary/beam.json'),'utf8'));assert.equal(beam.binaryReadback.allReferencesRead,true);assert.equal(beam.binaryReadback.allBeamControllersRead,true);
const integration=JSON.parse(await readFile(join(out,'binary/vfx-integration.json'),'utf8'));assert.equal(integration.beam.progfx2da.columns.Param1,'custom_beam');assert.equal(integration.visualeffects2da.rowId,null);assert.equal(integration.nativeVerified,false);
report.passed=true;await writeFile(join(out,'installed-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,project:report.project,jobs:report.jobs.length,nativeVerified:false}));
