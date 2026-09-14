import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {canonical,hash} from '../apps/service/src/store.js';
const root=resolve(import.meta.dirname,'..'),out=join(root,'output/releases/0.26.0');await mkdir(out,{recursive:true});
const cli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs'),run=promisify(execFile),consumer='C:/Projects/the last city';
async function call(args:string[]){const r=await run(process.execPath,[cli,'--json',...args],{cwd:consumer,windowsHide:true,maxBuffer:32*1024*1024});const v=JSON.parse(r.stdout);assert.notEqual(v.status,'failed',JSON.stringify(v.error));return v.data;}
const report:any={version:'0.26.0',consumerCwd:consumer,nativeVerified:false,jobs:[],phases:[]};
async function download(a:any,folder:string){await mkdir(folder,{recursive:true});const path=join(folder,a.fileName);await call(['artifacts','get',a.id,'--out',path,'--overwrite']);const b=await readFile(path);assert.equal(hash(b),a.sha256);assert.equal(b.length,a.size);return {name:a.fileName,sha256:a.sha256,bytes:b.length,artifactId:a.id,path};}
async function job(args:string[],folder:string){const q=await call(args),j=await call(['jobs','wait',q.id,'--timeout','60s']);assert.equal(j.status,'succeeded',JSON.stringify(j.error));const files=[];for(const a of j.artifacts)files.push(await download(a,folder));const row={id:j.id,projectId:j.projectId,revision:j.revision,metadata:j.metadata,files};report.jobs.push(row);console.log(JSON.stringify({job:j.id,files:files.length}));await writeFile(join(out,'installed-progress.json'),JSON.stringify(report,null,2));return row;}
report.doctor=await call(['doctor']);report.capabilities=await call(['capabilities']);assert.equal(report.capabilities.beamAuthoring.nativeMotion.minimumStudioVersion,'0.26.0');assert(report.capabilities.documentSchemaVersions.includes(17));
// Read-only export of this Studio task's own previously accepted technical fixtures.
const baseline=JSON.parse(await readFile(join(root,'output/releases/0.25.0/installed-acceptance.json'),'utf8'));
for(const [name,index,modelName] of [['fnf',0,'duration_audio'],['duration',1,'duration_audio'],['static-beam',2,'custom_beam']] as const){
  const old=baseline.jobs[index],row=await job(['candidate','build','--project',old.projectId,'--revision',String(old.revision),'--model-name',modelName,'--idempotency-key',`motion-0260-${name}-preservation`],join(out,name+'-preserved'));
  const resources=(files:any[])=>files.filter(f=>/\.(mdl|hak|tga|txi|wav|nss)$/.test(f.name)||f.name==='audio-events.json').map(f=>({name:f.name,sha256:f.sha256})).sort((a,b)=>a.name.localeCompare(b.name));
  assert.deepEqual(resources(row.files),resources(old.files));report[name+'ResourcesPreserved']=resources(row.files);
}
let p=await call(['projects','create','--project','studio-motion-0260-cli','--name','Technical native beam atlas CLI','--preset','empty','--lifecycle','beam','--idempotency-key','motion-0260-cli-create']);
p=(await call(['assets','import','--project',p.id,'--expected-revision',String(p.revision),'--file',join(root,'docs/agents/examples/beam-native-motion/technical-strip.png'),'--idempotency-key','motion-0260-cli-texture'])).project;
for(const phase of ['flow','opening','closing']){
  const example=JSON.parse(await readFile(join(root,`docs/agents/examples/beam-native-motion/${phase}.json`),'utf8'));
  const changes=[{type:'layer.set',layerId:'beam',values:{...example[0].values,texture:'asset:'+p.document.assets[0].id,width:.08,alpha:1,color:'#ffffff'}}];
  const input=join(out,`cli-${phase}.json`);await writeFile(input,JSON.stringify(changes,null,2));const edit=['--project',p.id,'--expected-revision',String(p.revision),'--input-file',input];
  await call(['changes','preview',...edit]);p=await call(['changes','apply',...edit,'--idempotency-key',`motion-0260-cli-${phase}-edit`]);assert.equal(p.document.schemaVersion,17);
  const record={phase,id:p.id,revision:p.revision,snapshotSha256:hash(canonical(p.document))};report.phases.push(record);await writeFile(join(out,`cli-${phase}-project.json`),JSON.stringify(p,null,2));
  const base=['--project',p.id,'--revision',String(p.revision)],model='bm26_'+phase;
  await download((await call(['projects','export',...base,'--idempotency-key',`motion-0260-cli-${phase}-zip`])).artifact,join(out,phase));
  for(const format of ['ascii','binary']){
    const r=await job(['candidate','build',...base,'--model-name',model,'--profile',`nwn-ee-beam-${format}-experimental-v1`,'--idempotency-key',`motion-0260-cli-${phase}-${format}`],join(out,phase,format));
    assert.equal(r.metadata.validation.integration.effect.schemaVersion,4);assert.equal(r.metadata.validation.integration.effect.beam.nativeMotion[0].settings.phase,phase);
    const beam=JSON.parse(await readFile(join(out,phase,format,'beam.json'),'utf8'));assert.equal(beam.version,2);assert.deepEqual(beam.layers[0].nativeMotion.crop,{x:0,y:6,width:16,height:4});
    if(format==='binary')assert.equal(beam.binaryReadback.allBeamControllersRead,true);
  }
  const png=await job(['preview','request',...base,'--format','png','--time','0.5','--idempotency-key',`motion-0260-cli-${phase}-png`],join(out,phase,'png'));assert.equal(png.metadata.beamNativeMotion[0].settings.phase,phase);
  if(phase==='flow')await job(['preview','request',...base,'--format','webm','--idempotency-key','motion-0260-cli-flow-webm'],join(out,phase,'video'));
}
report.passed=true;await writeFile(join(out,'installed-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,phases:report.phases,jobs:report.jobs.length,nativeVerified:false}));
