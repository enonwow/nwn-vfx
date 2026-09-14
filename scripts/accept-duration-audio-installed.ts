import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {canonical,hash} from '../apps/service/src/store.js';
import {mixAudio,readPcmWav} from '../packages/core/src/audio.js';
import {durationAudioFixture} from '../tests/fixtures/duration-audio.js';

const root=resolve(import.meta.dirname,'..'),out=join(root,'output/releases/0.24.0'),consumer='C:/Projects/the last city',before=process.argv.includes('--before');await mkdir(out,{recursive:true});
const cli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs'),run=promisify(execFile);
async function call(args:string[]){const r=await run(process.execPath,[cli,'--json',...args],{cwd:consumer,windowsHide:true,maxBuffer:32*1024*1024});const value=JSON.parse(r.stdout);assert.notEqual(value.status,'failed',JSON.stringify(value.error));return value.data;}
const report:any={version:before?'0.23.0':'0.24.0',consumerCwd:consumer,nativeVerified:false,projects:[],jobs:[]};
async function download(a:any,folder:string){await mkdir(folder,{recursive:true});const path=join(folder,a.fileName);await call(['artifacts','get',a.id,'--out',path,'--overwrite']);const bytes=await readFile(path);assert.equal(hash(bytes),a.sha256);assert.equal(bytes.length,a.size);return{name:a.fileName,sha256:a.sha256,bytes:bytes.length,artifactId:a.id,path};}
async function job(args:string[],folder:string){const queued=await call(args),done=await call(['jobs','wait',queued.id,'--timeout','60s']);assert.equal(done.status,'succeeded',JSON.stringify(done.error));const files=[];for(const a of done.artifacts)files.push(await download(a,folder));const row={id:done.id,projectId:done.projectId,revision:done.revision,metadata:done.metadata,files};report.jobs.push(row);console.log(JSON.stringify({job:done.id,project:done.projectId,files:files.length}));await writeFile(join(out,`${before?'before':'installed'}-progress.json`),JSON.stringify(report,null,2));return row;}
const {document:fixture,wav,asset}=durationAudioFixture(),fnf={...fixture,lifecycle:'impact',profileId:'nwn-ee-impact-ascii-experimental-v1',schemaVersion:13};
if(before){
  const source=join(out,'fnf-source.json');await writeFile(source,JSON.stringify(fnf));
  const p=await call(['projects','import','--project','studio-duration-audio-0240-fnf','--file',source,'--idempotency-key','duration-audio-0240-fnf-import']);
  report.project={id:p.id,revision:p.revision,snapshotSha256:hash(canonical(p.document))};
  await job(['candidate','build','--project',p.id,'--revision',String(p.revision),'--model-name','duration_audio','--idempotency-key','duration-audio-0240-fnf-before'],join(out,'fnf-before'));
  await writeFile(join(out,'fnf-before.json'),JSON.stringify(report,null,2));
}else{
  report.doctor=await call(['doctor']);report.capabilities=await call(['capabilities']);assert(report.capabilities.documentSchemaVersions.includes(15));assert.equal(report.capabilities.audio.duration.minimumStudioVersion,'0.24.0');
  const baseline=JSON.parse(await readFile(join(out,'fnf-before.json'),'utf8')),p=await call(['projects','inspect','--project',baseline.project.id]);assert.equal(hash(canonical(p.document)),baseline.project.snapshotSha256);
  const newFnf=await job(['candidate','build','--project',p.id,'--revision',String(p.revision),'--model-name','duration_audio','--idempotency-key','duration-audio-0240-fnf-after'],join(out,'fnf-after'));
  const selected=(files:any[])=>files.filter(f=>/\.(mdl|hak|tga|txi|wav|nss)$/.test(f.name)||f.name==='audio-events.json').map(f=>({name:f.name,sha256:f.sha256})).sort((a,b)=>a.name.localeCompare(b.name));assert.deepEqual(selected(newFnf.files),selected(baseline.jobs[0].files));report.fnfPreserved=selected(newFnf.files);
  const initial=structuredClone(fixture);delete initial.audioAssets;delete initial.audioClips;initial.schemaVersion=13;const source=join(out,'duration-source.json');await writeFile(source,JSON.stringify(initial));
  let d=await call(['projects','import','--project','studio-duration-audio-0240-loop','--file',source,'--idempotency-key','duration-audio-0240-import']);
  const audioPath=join(out,asset.name);await writeFile(audioPath,wav);d=(await call(['audio','import','--project',d.id,'--expected-revision',String(d.revision),'--file',audioPath,'--idempotency-key','duration-audio-0240-audio-import'])).project;
  const patch=join(out,'add-audio.json');await writeFile(patch,JSON.stringify(fixture.audioClips!.map(clip=>({type:'audio.add',clip}))));
  const change=['--project',d.id,'--expected-revision',String(d.revision),'--input-file',patch];await call(['changes','preview',...change]);d=await call(['changes','apply',...change,'--idempotency-key','duration-audio-0240-add']);assert.equal(d.document.schemaVersion,15);assert.deepEqual(d.document.layers,initial.layers);
  report.projects.push({id:d.id,revision:d.revision,snapshotSha256:hash(canonical(d.document)),geometryUnchanged:true});const base=['--project',d.id,'--revision',String(d.revision)];
  const zip=await call(['projects','export',...base,'--idempotency-key','duration-audio-0240-zip']);await download(zip.artifact,out);
  for(const format of ['ascii','binary'])await job(['candidate','build',...base,'--model-name','duration_audio','--profile',`nwn-ee-duration-${format}-experimental-v1`,'--idempotency-key',`duration-audio-0240-${format}`],join(out,format));
  await job(['preview','request',...base,'--format','webm','--cycles','3','--idempotency-key','duration-audio-0240-three-cycles'],join(out,'video'));
  const audio=readPcmWav(await readFile(join(out,'video/audio-mix.wav'))),one=mixAudio(d.document);assert.equal(audio.frames,230400);for(let i=0;i<3;i++)assert.equal(hash(audio.pcm.slice(i*one.pcm.length,(i+1)*one.pcm.length)),hash(one.pcm));
  const manifest=JSON.parse(await readFile(join(out,'ascii/audio-events.json'),'utf8')),b=manifest.preferredIntegration;assert.equal(manifest.version,2);assert.equal(b.schedule.intervalSeconds,1.6);assert.equal(b.frames,70560);assert.equal(hash(await readFile(join(out,'ascii',b.file))),b.sha256);
  const composition={duration:4.8,format:'webm',instances:[{id:'loop',projectId:d.id,revision:d.revision,start:0,position:[0,0,0],yawRadians:0,duration:4.8}]};const composeFile=join(out,'composition.json');await writeFile(composeFile,JSON.stringify(composition));
  const composed=await job(['preview','compose','--input-file',composeFile,'--idempotency-key','duration-audio-0240-compose'],join(out,'composition'));assert.equal(composed.metadata.audio,'omitted');assert(!composed.files.some((f:any)=>f.name.endsWith('.wav')));
  report.passed=true;await writeFile(join(out,'installed-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,projects:report.projects,jobs:report.jobs.length,fnfFilesPreserved:report.fnfPreserved.length,nativeVerified:false}));
}
