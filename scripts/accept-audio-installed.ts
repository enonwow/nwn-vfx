/** Public operations only. Isolated exact-visual forks; never native integration. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {execute,connection,health,downloadArtifact} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {BINARY_PROFILE_ID} from '../packages/core/src/export-profiles.js';
import {readPcmWav} from '../packages/core/src/audio.js';
const out=resolve('output/releases/0.15.0/audio');await mkdir(out,{recursive:true});
const call=async(operation:string,input:Record<string,unknown>={},key?:string)=>{const r=await execute(operation,input,{requestTimeout:60000},key);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data as any;};
const service=await health(await connection({}));assert.equal(service.version,'0.15.0');
const specs=[
  {name:'bite',source:'tlc-wampir-ugryzienie',revision:27,file:'C:/Projects/the last city/assets/vfx/wampir/audio/monster-bite/v1/ugryzienie-lagodne-v1.wav',sha:'c39d66018b978b0f2c16ea4efba85bb4a204f1d2a7079a7f3da44d229ede928c',starts:[.4],duration:1,modelName:'vb_audio0150'},
  {name:'heart',source:'tlc-wampir-bijace-serce',revision:5,file:'C:/Projects/the last city/assets/vfx/wampir/audio/heartbeat/v1/heartbeat-cycle-v1.wav',sha:'c2336be5483e2abace01b09a76aba0f1c3dba036822b23903a7d1866372047c5',starts:[.13716553287981859,.8871655328798186],duration:2,modelName:'vh_audio0150'},
];
const proof:any={service,passed:false,nativeVerified:false,fixtures:[]};
for(const spec of specs){
  const dir=join(out,spec.name);await mkdir(dir,{recursive:true});
  const bytes=await readFile(spec.file);assert.equal(hash(bytes),spec.sha);const wav=readPcmWav(bytes);assert.equal(wav.frames/wav.sampleRate,.6);
  const original=await call('projects.inspect',{projectId:spec.source,revision:spec.revision}),before=await call('projects.inspect',{projectId:spec.source});assert.equal(original.document.duration,spec.duration);
  const target=`studio-${spec.name}-audio-0150`;
  let p=await call('projects.fork',{projectId:spec.source,revision:spec.revision,newProjectId:target,name:original.document.name},`${target}-fork-v1`);
  assert.equal(hash(canonical(p.document)),hash(canonical(original.document)));
  const imported=await call('audio.import',{projectId:target,expectedRevision:p.revision,fileName:spec.file.split('/').at(-1),dataBase64:bytes.toString('base64')},`${target}-import-v1`);p=imported.project;assert.equal(imported.assetId,spec.sha);
  const changes=spec.starts.map((start,i)=>({type:'audio.add',clip:{id:`${spec.name}_audio_${i+1}`,type:'audio',name:`${spec.name} ${i+1}`,assetId:spec.sha,enabled:true,start,duration:.6,offset:0,gain:1,fadeIn:0,fadeOut:0}}));
  p=await call('changes.apply',{projectId:target,expectedRevision:p.revision,changes},`${target}-clips-v1`);
  const visual=structuredClone(p.document);delete visual.audioAssets;delete visual.audioClips;visual.schemaVersion=original.document.schemaVersion;assert.deepEqual(visual,original.document);
  await writeFile(join(dir,'clip-changes.json'),JSON.stringify(changes,null,2)+'\n');
  const entry:any={source:{projectId:spec.source,revision:spec.revision,sha256:hash(canonical(original.document)),audioSha256:spec.sha},projectId:target,revision:p.revision,sha256:hash(canonical(p.document)),visualDocumentUnchanged:true,jobs:[]};
  for(const [kind,operation,extra] of [['candidate','candidate.build',{profileId:BINARY_PROFILE_ID,modelName:spec.modelName}],['video','preview.request',{format:'webm'}]] as const){
    const accepted=await call(operation,{projectId:target,revision:p.revision,...extra},`${target}-${kind}-v1`);console.log(JSON.stringify({stage:'queued',fixture:spec.name,kind,jobId:accepted.id}));
    const deadline=Date.now()+240000;let job:any;
    do{job=await call('jobs.get',{jobId:accepted.id});if(['succeeded','failed','cancelled'].includes(job.status))break;assert.ok(Date.now()<deadline,'Recover queued job with the same key');await delay(1000);}while(true);
    assert.equal(job.status,'succeeded',JSON.stringify(job.error));const jobDir=join(dir,kind);await mkdir(jobDir,{recursive:true});
    for(const a of job.artifacts)if(a.name.endsWith('.zip')||a.name.endsWith('.wav')||['preview.webm','audio-events.json','handoff.json','validation.json'].includes(a.name))await downloadArtifact(a,join(jobDir,a.name),true,{});
    entry.jobs.push({kind,id:job.id,metadata:job.metadata,artifacts:job.artifacts,directory:jobDir});
    console.log(JSON.stringify({stage:'succeeded',fixture:spec.name,kind,jobId:job.id}));
  }
  const manifest=JSON.parse(await readFile(join(dir,'candidate/audio-events.json'),'utf8'));assert.deepEqual(manifest.events.map((e:any)=>e.start),spec.starts);assert.equal(manifest.autoPlayback,false);assert.equal(manifest.nativeVerified,false);
  const native=readPcmWav(await readFile(join(dir,'candidate',manifest.preferredIntegration.file)));assert.equal(native.sampleRate,44100);assert.equal(native.channels,1);assert.equal(native.frames,spec.duration*44100);
  const preview=readPcmWav(await readFile(join(dir,'video/audio-mix.wav')));assert.equal(preview.frames,spec.duration*48000);
  // Independent timing check: exact leading silence, original 44.1 kHz heart
  // samples shifted on the target grid within linear fractional-delay rounding.
  const first=Math.ceil(spec.starts[0]*44100-1e-7);assert.ok(native.pcm.subarray(0,first*2).every(v=>v===0));
  assert.equal(hash(await readFile(join(dir,'candidate',`source-audio-${spec.sha}.wav`))),spec.sha);
  entry.preferredIntegration=manifest.preferredIntegration;entry.events=manifest.events;entry.leadingSilentFrames=first;
  const exported=await call('projects.export',{projectId:target,revision:p.revision},`${target}-portable-v1`);await downloadArtifact(exported.artifact,join(dir,'project.zip'),true,{});
  const portable=await readFile(join(dir,'project.zip'));const restored=await call('projects.import',{projectId:target+'-portable',bundleBase64:portable.toString('base64')},`${target}-portable-import-v1`);
  assert.equal(hash(canonical(restored.document)),entry.sha256);entry.portable={artifact:exported.artifact,restoredProjectId:restored.id,exactCanonicalRoundtrip:true};
  const after=await call('projects.inspect',{projectId:spec.source});assert.equal(after.revision,before.revision);assert.equal(hash(canonical(after.document)),hash(canonical(before.document)));assert.equal(hash(await readFile(spec.file)),spec.sha);
  entry.acceptedSourcePreserved=true;proof.fixtures.push(entry);await writeFile(join(out,'installed-audio-proof.json'),JSON.stringify(proof,null,2)+'\n');
}
proof.passed=true;await writeFile(join(out,'installed-audio-proof.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({passed:true,nativeVerified:false,fixtures:proof.fixtures.map((f:any)=>({projectId:f.projectId,revision:f.revision,resref:f.preferredIntegration.resref,jobs:f.jobs.map((j:any)=>({kind:j.kind,id:j.id}))}))}));
