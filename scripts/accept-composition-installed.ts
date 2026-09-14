import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {connection,health,execute,downloadArtifact} from '../apps/cli/src/client.js';
import {canonical,hash} from '../apps/service/src/store.js';
import {flipbookFixture} from '../tests/fixtures/flipbook.js';

const out=resolve('output/releases/0.21.0');await mkdir(out,{recursive:true});
const conn=await connection({}),service=await health(conn);assert.equal(service.version,'0.21.0');
const call=async(operation:string,input:Record<string,unknown>,key?:string)=>{const r=await execute(operation,input,{},key);assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data as any;};
const projectId='studio-composition-0210',p=await call('projects.import',{projectId,document:flipbookFixture()},'composition-0210-fixture-v1');
const p2=await call('changes.apply',{projectId,expectedRevision:p.revision,changes:[{type:'layer.set',layerId:'atlas',values:{flipbook:{columns:2,rows:2,frameStart:0,frameEnd:3,fps:6}}}]},'composition-0210-revision-v1');
const request={duration:1.5,time:1,format:'webm',referenceGeometry:false,camera:{position:[0,-7,.7],target:[0,0,.7],fov:39},instances:[
  {id:'left',projectId,revision:p.revision,snapshotSha256:hash(canonical(p.document)),start:0,position:[-1,0,0],yawRadians:0,scale:.4},
  {id:'right',projectId,revision:p2.revision,snapshotSha256:hash(canonical(p2.document)),start:.5,position:[1,0,0],yawRadians:Math.PI,scale:.6}]};
const inputPath=join(out,'cli-compose.json');await writeFile(inputPath,JSON.stringify(request,null,2));
const cli='C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio/bin/nwn-vfx.mjs';
const global=(args:string[])=>{const r=JSON.parse(execFileSync(process.execPath,[cli,'--json',...args],{cwd:'C:/Projects/the last city',windowsHide:true,encoding:'utf8',timeout:150000}));assert.notEqual(r.status,'failed',JSON.stringify(r.error));return r.data;};
const accepted=global(['preview','compose','--input-file',inputPath,'--idempotency-key','composition-0210-installed-v1']);
const job=global(['jobs','wait',accepted.id,'--timeout','120s']);assert.equal(job.status,'succeeded',JSON.stringify(job.error));
for(const artifact of job.artifacts){const path=join(out,'cli-'+artifact.name);await downloadArtifact(artifact,path,true,{});assert.equal(hash(await readFile(path)),artifact.sha256);}
const manifest=JSON.parse(await readFile(join(out,'cli-composition.json'),'utf8'));assert.equal(manifest.instances.length,2);assert.deepEqual(manifest.instances.map((i:any)=>i.snapshotSha256),request.instances.map(i=>i.snapshotSha256));assert.equal(manifest.nativeVerified,false);
assert.equal((await call('projects.inspect',{projectId})).revision,p2.revision);
await writeFile(join(out,'installed-cli.json'),JSON.stringify({passed:true,service,projectId,revision:p2.revision,job,manifest},null,2));console.log(JSON.stringify({passed:true,version:service.version,projectId,jobId:job.id}));
