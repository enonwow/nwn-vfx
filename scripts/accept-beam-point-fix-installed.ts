import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {canonical,hash} from '../apps/service/src/store.js';
const root=resolve(import.meta.dirname,'..'),out=join(root,'output/releases/0.26.1');await mkdir(out,{recursive:true});
const cli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs'),run=promisify(execFile),consumer='C:/Projects/the last city';
async function call(args:string[]){const r=await run(process.execPath,[cli,'--json',...args],{cwd:consumer,windowsHide:true,maxBuffer:32*1024*1024});const v=JSON.parse(r.stdout);assert.notEqual(v.status,'failed',JSON.stringify(v.error));return v.data;}
const report:any={version:'0.26.1',consumerCwd:consumer,nativeVerified:false,jobs:[]};
async function download(a:any,folder:string){await mkdir(folder,{recursive:true});const path=join(folder,a.fileName);await call(['artifacts','get',a.id,'--out',path,'--overwrite']);const b=await readFile(path);assert.equal(hash(b),a.sha256);assert.equal(b.length,a.size);return {name:a.fileName,sha256:a.sha256,bytes:b.length,artifactId:a.id,path};}
async function job(args:string[],folder:string){const q=await call(args),j=await call(['jobs','wait',q.id,'--timeout','60s']);assert.equal(j.status,'succeeded',JSON.stringify(j.error));const files=[];for(const a of j.artifacts)files.push(await download(a,folder));const row={id:j.id,projectId:j.projectId,revision:j.revision,metadata:j.metadata,files};report.jobs.push(row);console.log(JSON.stringify({job:j.id,files:files.length}));await writeFile(join(out,'installed-progress.json'),JSON.stringify(report,null,2));return row;}
report.doctor=await call(['doctor']);assert.equal(report.doctor.client.version,'0.26.1');
report.capabilities=await call(['capabilities']);assert.equal(report.capabilities.beamAuthoring.minimumSafeExporterVersion,'0.26.1');assert.equal(report.capabilities.beamAuthoring.nativeMotion.exportAvailable,false);
const original=await call(['projects','inspect','--project','tlc-wampir-drain-life','--revision','3']);
assert.equal(hash(canonical(original.document)),'3926a72b74f709a3d21c62e92c669f88ec42cf881b7f862375e415cf60631621');
const p=await call(['projects','fork','--project',original.id,'--revision','3','--name','Studio diagnostic - Drain Life r3 point-count fix','--idempotency-key','beam-0261-consumer-r3-diagnostic-fork']);
assert.notEqual(p.id,original.id);const same=structuredClone(p.document);same.name=original.document.name;assert.deepEqual(same,original.document);
report.source={projectId:original.id,revision:3,snapshotSha256:hash(canonical(original.document))};
report.fork={projectId:p.id,revision:p.revision,snapshotSha256:hash(canonical(p.document)),onlySourceChange:'diagnostic name'};
await writeFile(join(out,'diagnostic-project.json'),JSON.stringify(p,null,2));
for(const format of ['ascii','binary']){
  const folder=join(out,'diagnostic',format),r=await job(['candidate','build','--project',p.id,'--revision',String(p.revision),'--model-name','vd_drain01','--profile',`nwn-ee-beam-${format}-experimental-v1`,'--idempotency-key',`beam-0261-consumer-r3-${format}`],folder);
  assert.equal(r.metadata.validation.exporterVersion,`nwn-${format}-vfx-0.26.1`);assert.equal(r.metadata.validation.checks.beamPointCountsSafe,true);
  const name=format==='ascii'?'vd_drain01.mdl':'source-model.mdl.txt',actual=await readFile(join(folder,name),'utf8');
  const old=await readFile(join(consumer,'assets/vfx/wampir/drain-life/studio/v1/candidate/source-model.mdl.txt'),'utf8');
  assert.equal(hash(old),'352b0801311ac8a237901f3d2c8817566a600923ce8b3885f054e76f2bdb9609');
  assert.equal(actual,old.replace('birthrate 32','birthrate 33'),'sole authored MDL change is endpoint count');
  assert.equal(r.files.find((f:any)=>f.name==='vfx_4dfb279adda3.tga').sha256,'0353b01158180dbb59ca834d46e001c57468179d988d607343029931489ee3fa');
  assert.equal(r.files.find((f:any)=>f.name==='vfx_4dfb279adda3.txi').sha256,'534e3d88662aef184fff8fe9107a26ceb1ff2a0449a88b87850cbe853fc825bd');
  const beam=JSON.parse(await readFile(join(folder,'beam.json'),'utf8'));assert.deepEqual(beam.pointCountContract.layers,[{node:'beam_0',segments:32,pointCount:33}]);
  r.onlyMdlSourceChange='birthrate 32 -> 33';r.textureBytesPreserved=true;
}
// Resource regression on Studio-owned fixtures, never accepted consumer work.
const previous=JSON.parse(await readFile(join(root,'output/releases/0.26.0/installed-acceptance.json'),'utf8'));
for(const [name,index] of [['fnf',0],['duration',1]] as const){
  const old=previous.jobs[index],row=await job(['candidate','build','--project',old.projectId,'--revision',String(old.revision),'--model-name','duration_audio','--idempotency-key',`beam-0261-${name}-preservation`],join(out,name+'-preserved'));
  const resources=(files:any[])=>files.filter(f=>/\.(mdl|hak|tga|txi|wav|nss)$/.test(f.name)||f.name==='audio-events.json').map(f=>({name:f.name,sha256:f.sha256})).sort((a,b)=>a.name.localeCompare(b.name));
  assert.deepEqual(resources(row.files),resources(old.files));report[name+'ResourcesPreserved']=true;
}
// Old motion source remains readable/renderable; its native candidates fail closed.
const motion=await call(['projects','inspect','--project','studio-motion-0260-cli','--revision','3']);report.motionSourcePreserved=hash(canonical(motion.document))==='f2a0fff6bfa81f3013b1774c81acab3b0e351f3b24c8f8f47dd4380511cad84c';assert(report.motionSourcePreserved);
for(const format of ['ascii','binary']){
  const q=await call(['candidate','build','--project',motion.id,'--revision','3','--model-name','blocked_motion','--profile',`nwn-ee-beam-${format}-experimental-v1`,'--idempotency-key',`beam-0261-motion-block-${format}`]);
  // jobs.get returns the failed job in a successful read envelope.
  let j:any;for(let i=0;i<100;i++){j=await call(['jobs','get',q.id]);if(!['queued','running'].includes(j.status))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(j.status,'failed');assert.equal(j.error.code,'BEAM_MOTION_EXPORT_BLOCKED');assert.equal(j.artifacts.length,0);report.jobs.push({id:j.id,type:'blocked-motion-'+format,error:j.error,artifacts:[]});
}
const after=await call(['projects','inspect','--project',original.id,'--revision','3']);assert.deepEqual(after,original);
report.passed=true;await writeFile(join(out,'installed-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,fork:report.fork,jobs:report.jobs.length,nativeVerified:false}));
