import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { STUDIO_VERSION } from '../packages/core/src/model.js';

const execute=promisify(execFile),out=resolve('output/ugryzienie-01/installed'),example=resolve('docs/agents/examples/deformation');await mkdir(out,{recursive:true});
const cli=join(process.env.APPDATA!,'npm/node_modules/nwn-vfx-studio/dist/node/cli.js');
async function call(args:string[],timeout=false){
  try{const {stdout}=await execute(process.execPath,[cli,'--json',...args],{cwd:'C:/Projects/the last city',windowsHide:true,timeout:45000,maxBuffer:8*1024*1024});const r=JSON.parse(stdout);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;}
  catch(error:any){if(timeout&&JSON.parse(error.stdout||'{}').error?.code==='WAIT_TIMEOUT')return null;throw error;}
}
async function record(project:any,jobs:any[]) {
  const proof=jobs.find(j=>j.name==='ascii').metadata.validation.readback.meshes[0].deformation;
  for(const j of jobs.filter(j=>['png','webm'].includes(j.name))){assert.equal(j.metadata.deformations[0].animvertsSha256,proof.animvertsSha256);assert.equal(j.metadata.deformations[0].animtvertsSha256,proof.animtvertsSha256);}
  assert.deepEqual(jobs.find(j=>j.name==='binary').metadata.validation.readback.meshes[0].deformation,proof);
  const {diff:_,...saved}=project;
  assert.deepEqual(await call(['projects','inspect','--project',project.id]),saved);
  await writeFile(join(out,'report.json'),JSON.stringify({passed:true,version:STUDIO_VERSION,projectId:project.id,revision:3,jobs,nativeVerified:false},null,2));
  console.log(`PASS ${join(out,'report.json')}`);
}
if(process.argv.includes('--verify-only')) {
  const project=JSON.parse(await readFile(join(out,'project.json'),'utf8')),jobs=[];
  for(const name of ['png','webm','ascii','binary']) {
    const job=JSON.parse(await readFile(join(out,name,'job.json'),'utf8'));
    assert.deepEqual(await call(['jobs','get',job.id]),job);
    for(const artifact of job.artifacts){const bytes=await readFile(join(out,name,artifact.name));assert.equal(bytes.length,artifact.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);}
    jobs.push({name,id:job.id,revision:job.revision,metadata:job.metadata,artifacts:job.artifacts});
  }
  await record(project,jobs);process.exit(0);
}
const version=await call(['version']);assert.equal(version.cliVersion,STUDIO_VERSION);
const status=await call(['service','status']);assert.equal(status.version,STUDIO_VERSION);
const caps=await call(['capabilities']);assert.equal(caps.meshDeformation.documentSchemaVersion,7);
await writeFile(join(out,'discovery.json'),JSON.stringify({version,status,capabilities:caps},null,2));
const projectId='studio-ugryzienie-01-deformation',key=(name:string)=>['--idempotency-key',`studio-ugryzienie01-${name}-001`];
const created=await call(['projects','create','--project',projectId,'--name','Studio deformation technical example','--preset','empty',...key('create')]);assert.equal(created.revision,1);
await call(['assets','import','--project',projectId,'--expected-revision','1','--file',join(example,'red-surface.png'),...key('texture')]);
await call(['changes','preview','--project',projectId,'--expected-revision','2','--input-file',join(example,'changes.json')]);
const project=await call(['changes','apply','--project',projectId,'--expected-revision','2','--input-file',join(example,'changes.json'),...key('shape')]);assert.equal(project.document.schemaVersion,7);
await writeFile(join(out,'project.json'),JSON.stringify(project,null,2));
const jobs:any[]=[];
for(const [name,args] of [
  ['png',['preview','request','--time','.6','--format','png','--camera-file',join(example,'camera.json')]],
  ['webm',['preview','request','--format','webm','--camera-file',join(example,'camera.json')]],
  ['ascii',['candidate','build']],['binary',['candidate','build','--profile','nwn-ee-impact-binary-experimental-v1']],
] as Array<[string,string[]]>){
  const accepted=await call([...args,'--project',projectId,'--revision','3',...key(name)]);
  console.log(`${name}: accepted ${accepted.id}`);
  let job:any;const deadline=Date.now()+600000;
  do{assert(Date.now()<deadline,`Recover job ${accepted.id}`);job=await call(['jobs','wait',accepted.id,'--timeout','30s'],true);}while(!job);
  assert.equal(job.status,'succeeded',JSON.stringify(job.error));const dir=join(out,name);await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'job.json'),JSON.stringify(job,null,2));
  for(const artifact of job.artifacts){const target=join(dir,artifact.name);await call(['artifacts','get',artifact.id,'--out',target]);const bytes=await readFile(target);assert.equal(bytes.length,artifact.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);}
  jobs.push({name,id:job.id,revision:job.revision,metadata:job.metadata,artifacts:job.artifacts});console.log(`${name}: verified`);
}
await record(project,jobs);
