import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {canonical,hash} from '../apps/service/src/store.js';
const root=resolve(import.meta.dirname,'..'),out=join(root,'output/releases/0.26.2');await mkdir(out,{recursive:true});
const cli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs'),run=promisify(execFile),consumer='C:/Projects/the last city';
async function call(args:string[]){const r=await run(process.execPath,[cli,'--json',...args],{cwd:consumer,windowsHide:true,maxBuffer:32*1024*1024});const v=JSON.parse(r.stdout);assert.notEqual(v.status,'failed',JSON.stringify(v.error));return v.data;}
const report:any={version:'0.26.2',consumerCwd:consumer,nativeVerified:false,jobs:[]};
async function job(args:string[],label:string){
  const q=await call(args),j=await call(['jobs','wait',q.id,'--timeout','60s']);assert.equal(j.status,'succeeded',JSON.stringify(j.error));
  const folder=join(out,label);await mkdir(folder,{recursive:true});const files=[];
  for(const a of j.artifacts){const path=join(folder,a.fileName);await call(['artifacts','get',a.id,'--out',path,'--overwrite']);const bytes=await readFile(path);assert.equal(hash(bytes),a.sha256);assert.equal(bytes.length,a.size);files.push({name:a.fileName,sha256:a.sha256,bytes:bytes.length,artifactId:a.id,path});}
  const row={id:j.id,projectId:j.projectId,revision:j.revision,metadata:j.metadata,files};report.jobs.push(row);console.log(JSON.stringify({label,job:j.id,files:files.length}));await writeFile(join(out,'installed-progress.json'),JSON.stringify(report,null,2));return row;
}
report.doctor=await call(['doctor']);assert.equal(report.doctor.client.version,'0.26.2');
report.capabilities=await call(['capabilities']);assert.equal(report.capabilities.beamAuthoring.textureMapping.documentSchemaVersion,18);assert.equal(report.capabilities.beamAuthoring.nativeMotion.exportAvailable,false);
const original=await call(['projects','inspect','--project','tlc-wampir-drain-life','--revision','3']);
assert.equal(hash(canonical(original.document)),'3926a72b74f709a3d21c62e92c669f88ec42cf881b7f862375e415cf60631621');
const fork=await call(['projects','fork','--project',original.id,'--revision','3','--name','Studio diagnostic - Drain Life r3 explicit texture mapping','--idempotency-key','beam-0262-r3-texture-fork']);
assert.notEqual(fork.id,original.id);const same=structuredClone(fork.document);same.name=original.document.name;assert.deepEqual(same,original.document);
report.source={projectId:original.id,revision:3,snapshotSha256:hash(canonical(original.document))};
const legacy=await job(['candidate','build','--project',fork.id,'--revision','1','--model-name','vd_drain01','--profile','nwn-ee-beam-ascii-experimental-v1','--idempotency-key','beam-0262-legacy-preservation'],'legacy');
const old=JSON.parse(await readFile(join(root,'output/releases/0.26.1/installed-acceptance.json'),'utf8')).jobs[0];
const resources=(files:any[])=>files.filter(f=>/\.(mdl|hak|tga|txi)$/.test(f.name)).map(f=>({name:f.name,sha256:f.sha256})).sort((a,b)=>a.name.localeCompare(b.name));assert.deepEqual(resources(legacy.files),resources(old.files));report.legacyResourcesPreserved=true;
const changes=[{type:'layer.set',layerId:fork.document.layers[0].id,values:{textureMapping:{axis:'u',fit:'alpha-bounds'}}}],file=join(out,'mapping-changes.json');await writeFile(file,JSON.stringify(changes,null,2));
await call(['changes','preview','--project',fork.id,'--expected-revision','1','--input-file',file]);
const mapped=await call(['changes','apply','--project',fork.id,'--expected-revision','1','--input-file',file,'--idempotency-key','beam-0262-r3-explicit-mapping']);
assert.equal(mapped.document.schemaVersion,18);assert.deepEqual(mapped.document.assets,original.document.assets);
const without=structuredClone(mapped.document);delete without.layers[0].textureMapping;without.schemaVersion=original.document.schemaVersion;without.name=original.document.name;assert.deepEqual(without,original.document);
report.fork={projectId:mapped.id,revision:mapped.revision,snapshotSha256:hash(canonical(mapped.document)),onlyChanges:['diagnostic name','textureMapping u/alpha-bounds','schema promotion 18']};await writeFile(join(out,'diagnostic-project.json'),JSON.stringify(mapped,null,2));
for(const format of ['ascii','binary']){
  const row=await job(['candidate','build','--project',mapped.id,'--revision',String(mapped.revision),'--model-name','vd_drain_map','--profile',`nwn-ee-beam-${format}-experimental-v1`,'--idempotency-key',`beam-0262-mapping-${format}`],format);
  assert.equal(row.metadata.validation.exporterVersion,`nwn-${format}-vfx-0.26.2`);
  const beam=JSON.parse(await readFile(join(out,format,'beam.json'),'utf8'));assert.deepEqual(beam.layers[0].textureMapping.crop,{x:0,y:420,width:1024,height:184});assert.equal(beam.layers[0].textureMapping.outputRgbaSha256,'6fd73af3f5a832870e14d71ce958f745767712697d8a46a67597b90f6be53598');assert.equal(beam.layers[0].textureMapping.repetitions,32);
}
for(const format of ['png','webm'])await job(['preview','request','--project',mapped.id,'--revision',String(mapped.revision),'--format',format,'--time','.8','--idempotency-key',`beam-0262-mapping-${format}`],format);
const again=await call(['projects','inspect','--project',original.id,'--revision','3']);assert.deepEqual(again.document,original.document);report.sourcePreserved=true;report.passed=true;await writeFile(join(out,'installed-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,fork:report.fork,jobs:report.jobs.map((j:any)=>j.id)}));
