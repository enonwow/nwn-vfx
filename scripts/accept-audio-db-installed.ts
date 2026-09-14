/** Public operations on explicit fixtures; accepted consumer projects are read-only. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {execFileSync} from 'node:child_process';
import {execute,connection,health,downloadArtifact} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {audioFixture} from '../tests/fixtures/audio.js';
const out=resolve('output/releases/0.18.0');await mkdir(out,{recursive:true});
const beforeMode=process.argv.includes('--before'),service=await health(await connection({}));assert.equal(service.version,beforeMode?'0.17.0':'0.18.0');
const call=async(operation:string,input:Record<string,unknown>={},key?:string)=>{
  const r=await execute(operation,input,{requestTimeout:60000},key);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r;
};
async function consumerState(){
  const states=[];
  for(const [projectId,revision] of [['tlc-wampir-ugryzienie',31],['tlc-wampir-bijace-serce',9]] as const){
    const p=(await call('projects.inspect',{projectId})).data as any;assert.equal(p.revision,revision);assert(p.document.audioClips.every((c:any)=>c.gain===3));
    const revisions:any[]=[],artifacts:any[]=[];
    for(const [operation,target] of [['revisions.list',revisions],['artifacts.list',artifacts]] as const){let cursor:string|undefined;do{
      const page=(await call(operation,{projectId,limit:100,...(cursor?{cursor}:{})})).data as any;target.push(...page.items);cursor=page.nextCursor??undefined;
    }while(cursor);}
    states.push({projectId,revision,sha256:hash(canonical(p.document)),audioAssetsSha256:hash(canonical(p.document.audioAssets)),
      clips:p.document.audioClips.map((c:any)=>({id:c.id,gain:c.gain})),revisionsSha256:hash(canonical(revisions)),
      artifacts:artifacts.map(a=>({id:a.id,sha256:a.sha256,size:a.size})).sort((a,b)=>a.id.localeCompare(b.id))});
  }
  return states;
}
const baselinePath=join(out,'legacy-baseline.json'),baseline=beforeMode?undefined:JSON.parse(await readFile(baselinePath,'utf8'));
const report:any={service,consumer:await consumerState(),fixtures:[],passed:false,nativeVerified:false};
if(baseline)assert.deepEqual(report.consumer,baseline.consumer);
for(const [gain,suffix] of [[0,'zero'],[1.5,'15'],[3,'3']] as const){
  const f=audioFixture(true),document={...f.document,audioClips:[{...f.clip,gain}]},projectId=`studio-db-legacy-${suffix}`,modelName=`db_legacy_${suffix}`;
  const p=(await call('projects.import',{projectId,document},`db-legacy-${suffix}-import-0180-v1`)).data as any;
  assert.equal(p.document.audioClips[0].gain,gain);const current=(await call('projects.inspect',{projectId})).data as any;assert.equal(current.revision,1);assert.deepEqual(current.document,document);
  const jobId=((await call('candidate.build',{projectId,revision:1,modelName},`db-legacy-${suffix}-${beforeMode?'before':'after'}-0180-v1`)).data as any).id;
  const deadline=Date.now()+120000;let job:any;
  do{job=(await call('jobs.get',{jobId})).data;if(['succeeded','failed','cancelled'].includes(job.status))break;assert(Date.now()<deadline);await delay(500);}while(true);
  assert.equal(job.status,'succeeded',JSON.stringify(job.error));
  const resources=job.artifacts.filter((a:any)=>/\.(wav|mdl|tga|txi)$/.test(a.name)).map((a:any)=>({name:a.name,sha256:a.sha256,size:a.size})).sort((a:any,b:any)=>a.name.localeCompare(b.name));
  assert(resources.some((a:any)=>a.name==='audio-mix.wav'));assert(resources.some((a:any)=>a.name.endsWith('.mdl')));
  const portable=(await call('projects.export',{projectId,revision:1},`db-legacy-${suffix}-portable-${beforeMode?'before':'after'}-v1`)).data as any;
  const target=join(out,`legacy-${suffix}-${beforeMode?'before':'after'}.zip`);await downloadArtifact(portable.artifact,target,true,{});
  if(!beforeMode){
    const imported=(await call('projects.import',{projectId:`studio-db-roundtrip-${suffix}`,bundleBase64:(await readFile(join(out,`legacy-${suffix}-before.zip`))).toString('base64')},`db-legacy-roundtrip-${suffix}-v1`)).data as any;
    assert.deepEqual(imported.document,document);
  }
  const entry={projectId,revision:1,gain,documentSha256:hash(canonical(document)),resources,jobId,portableArtifact:portable.artifact};
  if(baseline){const previous=baseline.fixtures.find((x:any)=>x.projectId===projectId);assert.equal(entry.documentSha256,previous.documentSha256);assert.deepEqual(resources,previous.resources);}
  report.fixtures.push(entry);console.log(JSON.stringify({stage:beforeMode?'baseline':'verified',projectId,gain,resources:resources.length}));
}
if(!beforeMode){
  const cliPath='C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs',foreignCwd='C:/Projects/the last city';
  const p=(await call('projects.fork',{projectId:'studio-db-legacy-3',revision:1,newProjectId:'studio-db-0180',name:'TEST — Wzmocnienie dB — 0.18.0'},'studio-db-0180-fork-v1')).data as any;
  const patchPath=join(out,'gain-db.json');await writeFile(patchPath,JSON.stringify([{type:'audio.set',clipId:'bite',values:{gainDb:24}}],null,2)+'\n');
  const invoke=(verb:string)=>JSON.parse(execFileSync(process.execPath,[cliPath,'--json','changes',verb,'--project',p.id,'--expected-revision','1','--input-file',patchPath,...(verb==='apply'?['--idempotency-key','db-0180-cli-24-v1']:[])],{cwd:foreignCwd,encoding:'utf8',windowsHide:true}));
  const preview=invoke('preview');assert.equal(preview.status,'ok');assert.equal(preview.data.document.schemaVersion,10);assert(preview.diagnostics[0].audio.peakDbFS>0);
  const applied=invoke('apply');assert.equal(applied.status,'ok');assert.equal(applied.data.document.audioClips[0].gain,10**1.2);assert.deepEqual(applied.data.document.audioAssets,p.document.audioAssets);
  const read=(await call('projects.inspect',{projectId:p.id}));assert.equal((read.diagnostics[0] as any).clips[0].gainDb,24);
  report.cli={cwd:foreignCwd,projectId:p.id,revision:applied.data.revision,gainDb:24,gain:applied.data.document.audioClips[0].gain,diagnostics:preview.diagnostics,sourceUnchanged:true};
  const conn=await connection({});const legacy=await fetch(conn.endpoint+'/api/commands',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+conn.token},body:JSON.stringify({operation:'projects.inspect',input:{projectId:p.id}})}).then(r=>r.json());
  assert.equal(legacy.error.code,'CLIENT_UPGRADE_REQUIRED');report.legacyClientRefusal=legacy.error;
}
assert.deepEqual(await consumerState(),report.consumer);report.passed=true;
await writeFile(beforeMode?baselinePath:join(out,'installed-audio-db.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,phase:beforeMode?'before':'installed',consumer:report.consumer.map((x:any)=>({projectId:x.projectId,revision:x.revision,sha256:x.sha256})),cli:report.cli?.projectId}));
